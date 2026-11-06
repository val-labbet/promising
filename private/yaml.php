<?php
/*

What correctly formatted means, for the backend. Yaml::problem() and
Json::problem() return null for a correct text, otherwise what is wrong.

*/

declare(strict_types=1);

// ── Json ──────────────────────────────────────────────────────────────────────

final class Json
{
    // Correct json is what PHP's pretty print writes
    public static function problem(string $text): ?string
    {
        $data = json_decode($text);
        if (json_last_error() !== JSON_ERROR_NONE) return 'Not json: ' . json_last_error_msg();
        $canonical = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $canonical === $text ? null : 'Not pretty printed json (4 spaces, no slashes or unicode escaped)';
    }
}


// ── Canonical yaml ────────────────────────────────────────────────────────────

/*
  The same rules as system/yaml.js: a text is correct when writing what it
  contains gives back exactly the same text. The reader only knows the shapes
  the writer makes, so anything else is refused before it is compared.

  Maps are objects (stdClass), lists are arrays, so {} and [] stay apart.
*/
final class Yaml
{
    private const RESERVED = '/^(null|~|true|false|yes|no|on|off|y|n)$/i';
    private const NUMBERISH = '/^[-+.]?\d|^[-+]?\.(inf|nan)$/i';
    private const INDICATOR = '/^[-?:,[\]{}#&*!|>\'"%@`<=.]/';
    private const UNPRINTABLE = '/[\x{00}-\x{1f}\x{7f}-\x{9f}\x{2028}\x{2029}\x{feff}]/u';
    private const ESCAPES = ['"' => '\\"', '\\' => '\\\\', "\n" => '\\n', "\t" => '\\t', "\r" => '\\r', "\x08" => '\\b', "\x0c" => '\\f'];

    private array $lines = [];
    private int $at = 0;

    public static function problem(string $text): ?string
    {
        if (!mb_check_encoding($text, 'UTF-8')) return 'Not utf-8';
        try {
            $canonical = self::dump(self::load($text));
        } catch (Throwable $error) {
            return $error->getMessage();
        }
        if ($canonical === $text) return null;
        $a = explode("\n", $text);
        $b = explode("\n", $canonical);
        $line = 0;
        while (($a[$line] ?? null) === ($b[$line] ?? null)) $line++;
        return sprintf('Not canonical yaml at line %d: "%s" should be "%s"', $line + 1, $a[$line] ?? '', $b[$line] ?? '');
    }

    // ── Writing ──

    public static function dump(mixed $data): string
    {
        return implode("\n", self::isBlock($data) ? self::block($data, '') : [self::scalar($data)]) . "\n";
    }

    private static function isBlock(mixed $v): bool
    {
        return (is_array($v) && count($v) > 0) || ($v instanceof stdClass && count(get_object_vars($v)) > 0);
    }

    private static function block(mixed $v, string $pad): array
    {
        $lines = [];
        if (is_array($v)) {
            foreach ($v as $item) {
                if (!self::isBlock($item)) {
                    $lines[] = $pad . '- ' . self::scalar($item);
                } else {
                    $inner = self::block($item, $pad . '  ');
                    $inner[0] = $pad . '- ' . substr($inner[0], strlen($pad) + 2);
                    array_push($lines, ...$inner);
                }
            }
        } else {
            foreach (self::entries($v) as [$key, $item]) {
                $head = $pad . self::string($key) . ':';
                if (!self::isBlock($item)) {
                    $lines[] = $head . ' ' . self::scalar($item);
                } else {
                    $lines[] = $head;
                    array_push($lines, ...self::block($item, is_array($item) ? $pad : $pad . '  '));
                }
            }
        }
        return $lines;
    }

    // In the order javascript keeps them: array index keys first, ascending, then the rest as written
    private static function entries(stdClass $map): array
    {
        $index = [];
        $rest = [];
        foreach (get_object_vars($map) as $key => $value) {
            $key = (string) $key;
            if (preg_match('/^(0|[1-9]\d*)$/', $key) && (float) $key < 4294967295) $index[] = [$key, $value];
            else $rest[] = [$key, $value];
        }
        usort($index, fn ($a, $b) => (int) $a[0] <=> (int) $b[0]);
        return [...$index, ...$rest];
    }

    private static function scalar(mixed $v): string
    {
        if ($v === null) return 'null';
        if (is_bool($v)) return $v ? 'true' : 'false';
        if (is_int($v)) return (string) $v;
        if (is_float($v)) return self::number($v);
        if (is_string($v)) return self::string($v);
        if (is_array($v)) return '[]';
        return '{}';
    }

    // As javascript's String(number)
    private static function number(float $n): string
    {
        if (!is_finite($n)) throw new RuntimeException('Cannot write ' . $n . ' as yaml');
        if ($n == floor($n) && abs($n) < 1e21) return number_format($n, 0, '.', '');
        return str_replace(['.0e', 'e+0', 'e-0'], ['e', 'e+', 'e-'], json_encode($n));
    }

    private static function string(string $s): string
    {
        $unprintable = preg_match(self::UNPRINTABLE, $s) === 1;
        if ($s !== '' && !preg_match(self::RESERVED, $s) && !preg_match(self::NUMBERISH, $s) && !preg_match(self::INDICATOR, $s)
            && !preg_match('/^[ \t]|[ \t]$/', $s) && !preg_match('/: |:$| #/', $s) && !$unprintable) return $s;
        if (!$unprintable) return "'" . str_replace("'", "''", $s) . "'";
        return '"' . preg_replace_callback('/["\\\\\x{00}-\x{1f}\x{7f}-\x{9f}\x{2028}\x{2029}\x{feff}]/u',
            fn ($m) => self::ESCAPES[$m[0]] ?? sprintf('\\u%04x', mb_ord($m[0], 'UTF-8')), $s) . '"';
    }

    // ── Reading ──

    public static function load(string $text): mixed
    {
        if (!str_ends_with($text, "\n")) throw new RuntimeException('The file must end with a line break');
        $reader = new self();
        $reader->lines = explode("\n", substr($text, 0, -1));
        if (count($reader->lines) === 1 && !self::startsBlock($reader->lines[0])) return self::value($reader->lines[0]);
        $data = $reader->readBlock(0);
        if ($reader->at < count($reader->lines)) {
            throw new RuntimeException(sprintf('Unexpected line %d: "%s"', $reader->at + 1, $reader->lines[$reader->at]));
        }
        return $data;
    }

    private static function startsBlock(string $line): bool
    {
        return str_starts_with($line, '- ') || self::key($line) !== null;
    }

    private function line(): ?string
    {
        return $this->lines[$this->at] ?? null;
    }

    private function readBlock(int $indent): mixed
    {
        $line = $this->line();
        if ($line !== null && str_starts_with($line, str_repeat(' ', $indent) . '- ')) return $this->readSequence($indent);
        return $this->readMap($indent);
    }

    private function readSequence(int $indent): array
    {
        $prefix = str_repeat(' ', $indent) . '- ';
        $list = [];
        while (($line = $this->line()) !== null && str_starts_with($line, $prefix)) {
            $rest = substr($line, strlen($prefix));
            if (self::startsBlock($rest)) {
                // "- key: value" is the first line of a map (or list) indented two more
                $this->lines[$this->at] = str_repeat(' ', $indent + 2) . $rest;
                $list[] = $this->readBlock($indent + 2);
            } else {
                $list[] = self::value($rest);
                $this->at++;
            }
        }
        return $list;
    }

    private function readMap(int $indent): stdClass
    {
        $pad = str_repeat(' ', $indent);
        $map = new stdClass();
        while (($line = $this->line()) !== null && str_starts_with($line, $pad) && !str_starts_with($line, $pad . ' ') && !str_starts_with($line, $pad . '- ')) {
            $found = self::key(substr($line, $indent));
            if ($found === null) throw new RuntimeException(sprintf('Expected "key:" at line %d: "%s"', $this->at + 1, $line));
            [$key, $rest] = $found;
            if (property_exists($map, $key)) throw new RuntimeException(sprintf('The key "%s" is there twice, line %d', $key, $this->at + 1));
            $this->at++;
            if ($rest !== '') {
                $map->{$key} = self::value($rest);
                continue;
            }
            $next = $this->line() ?? '';
            if (str_starts_with($next, $pad . '- ')) $map->{$key} = $this->readSequence($indent);
            elseif (str_starts_with($next, $pad . '  ') && !str_starts_with($next, $pad . '   ')) $map->{$key} = $this->readMap($indent + 2);
            else throw new RuntimeException(sprintf('"%s:" has no value at line %d (write null)', $key, $this->at));
        }
        if (count(get_object_vars($map)) === 0) {
            throw new RuntimeException(sprintf('Unexpected line %d: "%s"', $this->at + 1, $this->line() ?? ''));
        }
        return $map;
    }

    // "key: rest" or "key:" → [key, rest], with a plain or quoted key
    private static function key(string $text): ?array
    {
        [$token, $after] = self::token($text);
        if ($token === null) return null;
        if ($after === ':') return [$token, ''];
        if (str_starts_with($after, ': ')) return [$token, substr($after, 2)];
        return null;
    }

    // The first plain or quoted string in text, and what follows it
    private static function token(string $text): array
    {
        if (str_starts_with($text, "'")) {
            if (!preg_match("/^'((?:[^']|'')*)'(.*)$/s", $text, $m)) return [null, ''];
            return [str_replace("''", "'", $m[1]), $m[2]];
        }
        if (str_starts_with($text, '"')) {
            if (!preg_match('/^"((?:[^"\\\\]|\\\\.)*)"(.*)$/s', $text, $m)) return [null, ''];
            return [self::unescape($m[1]), $m[2]];
        }
        $colon = strpos($text, ': ');
        if ($colon === false && str_ends_with($text, ':')) $colon = strlen($text) - 1;
        if ($colon === false || $colon === 0) return [null, ''];
        return [substr($text, 0, $colon), substr($text, $colon)];
    }

    private static function unescape(string $s): string
    {
        return preg_replace_callback('/\\\\(u[0-9a-fA-F]{4}|.)/', function ($m) {
            $map = ['"' => '"', '\\' => '\\', 'n' => "\n", 't' => "\t", 'r' => "\r", 'b' => "\x08", 'f' => "\x0c"];
            if ($m[1][0] === 'u') return mb_chr(hexdec(substr($m[1], 1)), 'UTF-8');
            if (!isset($map[$m[1]])) throw new RuntimeException('Unknown escape \\' . $m[1]);
            return $map[$m[1]];
        }, $s);
    }

    // A whole scalar: null, true, false, a number, [], {}, or a string
    private static function value(string $text): mixed
    {
        if ($text === 'null') return null;
        if ($text === 'true') return true;
        if ($text === 'false') return false;
        if ($text === '[]') return [];
        if ($text === '{}') return new stdClass();
        if (preg_match('/^-?(0|[1-9]\d*)$/', $text) && abs((float) $text) < 9007199254740992) return (int) $text;
        if (preg_match('/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/', $text)) return (float) $text;
        if ($text !== '' && ($text[0] === "'" || $text[0] === '"')) {
            [$token, $after] = self::token($text);
            if ($token === null || $after !== '') throw new RuntimeException('Broken quoted string: ' . $text);
            return $token;
        }
        return $text;
    }
}
