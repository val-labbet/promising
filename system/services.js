/*

Services: something the site sends a question to and gets an answer from, such
as a population register. While prototyping, the service is a function in
site.js that only pretends; a page calls it the same way it would call a real
one, so the pages do not change when it becomes real.

  // site.js
  Promising.service('folkbokföring', ({ personnummer }) => …the answer…,
    { about: 'Looks up a person', delay: 500 })

  # a page
  - form:
    - call: folkbokföring
    - to: hittad
    - input:
      - name: personnummer

The fields are sent, and the answer is written to the model at to:

  hittad.sent      the fields that were sent, e.g. hittad.sent.personnummer
  hittad.loading   true while waiting (a pretend delay, 300–800 ms unless delay is given)
  hittad.result    the answer, or null
  hittad.error     what went wrong, e.g. thrown by the function
  hittad.done      true when the answer has come, with or without a result

The function may return a promise. The latest calls are kept for meta/services.

  Promising.service(name, fn, { about, delay })
  Promising.call(name, data, to)     → the result; what a form's call: does
  Promising.services                 { name: { about, delay } }
  Promising.calls                    the latest calls, newest first

*/

window.Promising ||= {};

(() => {

  'use strict';

  const P = Promising;
  const KEEP = 20;
  const functions = {};

  P.services = {};
  P.calls = [];

  P.service = (name, fn, { about = null, delay = null } = {}) => {
    functions[name] = fn;
    P.services[name] = { about, delay };
  };

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  P.call = async (name, data = {}, to = null) => {
    const call = { name, time: new Date().toISOString(), data, loading: true, result: null, error: null };
    P.calls.unshift(call);
    P.calls.length = Math.min(P.calls.length, KEEP);
    const state = () => ({ sent: data, loading: call.loading, result: call.result, error: call.error, done: !call.loading });
    if (to) P.set(to, state());

    await wait(P.services[name]?.delay ?? 300 + Math.random() * 500);
    try {
      if (!functions[name]) throw new Error(`There is no service named ${name}`);
      call.result = (await functions[name](data, P.model)) ?? null;
    } catch (error) {
      call.error = error.message;
    }
    call.loading = false;

    if (to) P.set(to, state());
    else P.draw();
    return call.result;
  };

})();
