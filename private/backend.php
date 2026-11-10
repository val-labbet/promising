<?php
/*

The promising backend. Reached through system/api.php; this folder itself is
closed to the web (.htaccess).

It can only replace files that already exist under data_root, with text that
is correctly formatted: canonical yaml (the same rules as system/yaml.js) or
json as PHP pretty prints it. Nothing else.

  GET  api.php?action=stat                  { files: { path: hash } }      for polling
  GET  api.php?action=read&file=persons.yaml { file, hash, text }
  GET  api.php?action=whoami                { name }                       needs a key
  GET  api.php?action=log                   { log: [{ time, name, file, bytes }] }   the latest
                                            saves, newest first; needs a key
  POST api.php?action=write                 { file, text, base_hash } → { file, hash }

The key goes in the header X-Promising-Key (or ?key=). Keys are named in
config.json, and the name is written to the log with every change.

  400 bad request   403 wrong key   404 no such file   409 changed since base_hash
  413 too large     422 not correctly formatted

*/

declare(strict_types=1);

require __DIR__ . '/yaml.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$config = json_decode((string) @file_get_contents(__DIR__ . '/config.json'), true);
if (!is_array($config)) fail(500, 'The backend has no config.json');

$root = realpath(__DIR__ . '/' . ($config['data_root'] ?? '../site/data'));
if ($root === false) fail(500, 'data_root does not exist');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'stat':
        respond(['files' => hashes($root)]);

    case 'read':
        $path = existing($root, (string) ($_GET['file'] ?? ''));
        $text = (string) file_get_contents($path);
        respond(['file' => relative($root, $path), 'hash' => sha1($text), 'text' => $text]);

    case 'whoami':
        respond(['name' => who($config)]);

    case 'log':
        who($config);
        respond(['log' => latest($config, 30)]);

    case 'write':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(400, 'write needs POST');
        $name = who($config);
        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body) || !is_string($body['file'] ?? null) || !is_string($body['text'] ?? null)) {
            fail(400, 'Send { file, text, base_hash } as json');
        }
        write($root, $config, $name, $body['file'], $body['text'], (string) ($body['base_hash'] ?? ''));

    default:
        fail(400, 'Unknown action');
}


// ── Answers ───────────────────────────────────────────────────────────────────

function respond(array $data): never
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message, array $extra = []): never
{
    http_response_code($status);
    respond(['error' => $message] + $extra);
}


// ── Keys and files ────────────────────────────────────────────────────────────

// The name of the key that was sent, or 403
function who(array $config): string
{
    $sent = (string) ($_SERVER['HTTP_X_PROMISING_KEY'] ?? $_GET['key'] ?? '');
    foreach ($config['keys'] ?? [] as $entry) {
        $key = (string) ($entry['key'] ?? '');
        if ($sent !== '' && strlen($key) >= 16 && hash_equals($key, $sent)) return (string) ($entry['name'] ?? '?');
    }
    fail(403, 'Wrong or missing key');
}

// A .yaml or .json file that exists under root, or 404
function existing(string $root, string $file): string
{
    if (!preg_match('/\.(ya?ml|json)$/', $file) || str_contains($file, "\0")) fail(404, 'Only existing .yaml and .json files');
    $path = realpath($root . '/' . $file);
    if ($path === false || !is_file($path) || !str_starts_with($path, $root . DIRECTORY_SEPARATOR)) fail(404, 'No such file: ' . $file);
    return $path;
}

function relative(string $root, string $path): string
{
    return str_replace(DIRECTORY_SEPARATOR, '/', substr($path, strlen($root) + 1));
}

function hashes(string $root): array
{
    $files = [];
    $all = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($all as $file) {
        $path = $file->getPathname();
        if (preg_match('/\.(ya?ml|json)$/', $path) && !str_contains(relative($root, $path), '/.')) {
            $files[relative($root, $path)] = sha1_file($path);
        }
    }
    ksort($files);
    return $files;
}

// The latest lines of the log, newest first, without the hashes
function latest(array $config, int $count): array
{
    $lines = @file(__DIR__ . '/' . ($config['log'] ?? 'log.txt'), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $entries = [];
    foreach (array_reverse(array_slice($lines, -$count)) as $line) {
        $parts = explode("\t", $line);
        if (count($parts) < 4) continue;
        $entries[] = ['time' => $parts[0], 'name' => $parts[1], 'file' => $parts[2], 'bytes' => (int) $parts[3]];
    }
    return $entries;
}

function write(string $root, array $config, string $name, string $file, string $text, string $base): never
{
    $path = existing($root, $file);
    $max = (int) ($config['max_bytes'] ?? 200000);
    if (strlen($text) > $max) fail(413, "The file is larger than $max bytes");

    $problem = str_ends_with($path, '.json') ? Json::problem($text) : Yaml::problem($text);
    if ($problem !== null) fail(422, $problem);

    // One writer at a time; the lock is its own file since the data file is replaced
    $lock = fopen(__DIR__ . '/write.lock', 'c');
    flock($lock, LOCK_EX);
    $old = sha1((string) file_get_contents($path));
    if (!hash_equals($old, $base)) {
        flock($lock, LOCK_UN);
        fail(409, 'The file has changed since you loaded it', ['hash' => $old]);
    }
    $temp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($temp, $text) === false || !rename($temp, $path)) {
        @unlink($temp);
        flock($lock, LOCK_UN);
        fail(500, 'Could not write the file');
    }
    $hash = sha1($text);
    $log = $config['log'] ?? 'log.txt';
    file_put_contents(__DIR__ . '/' . $log, sprintf("%s\t%s\t%s\t%d bytes\t%s → %s\n", date('c'), $name, $file, strlen($text), substr($old, 0, 8), substr($hash, 0, 8)), FILE_APPEND);
    flock($lock, LOCK_UN);
    respond(['file' => relative($root, $path), 'hash' => $hash]);
}
