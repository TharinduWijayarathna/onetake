// Reusable steps for this demo, loaded before the tour on every page (config: include).
// Use `var` / functions here: `let` and `const` stay inside this file.

/** Pick an option in a custom dropdown (Select2, Headless UI, Radix…): open it, choose. */
OneTake.define('choose', function (take, field, option) {
  take.click('label=' + field).click('role=option[name="' + option + '"]');
});

/** Fill several fields at once: take.fill({ 'Name': 'Jane', 'Email': 'jane@example.com' }) */
OneTake.define('fill', function (take, fields) {
  Object.keys(fields).forEach(function (label) { take.type('label=' + label, fields[label]); });
});
