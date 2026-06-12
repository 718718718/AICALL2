console.log('Phone formatting test:');
const phone = '09062660207';
let formatted = phone.replace(/[^\d+]/g, '');

if (!formatted.startsWith('+')) {
  if (formatted.startsWith('0')) {
    formatted = '+81' + formatted.substring(1);
  } else if (!formatted.startsWith('81')) {
    formatted = '+81' + formatted;
  } else {
    formatted = '+' + formatted;
  }
}

console.log('Original:', phone);
console.log('Formatted:', formatted);
console.log('Valid international format:', formatted.match(/^\+81\d{9,10}$/) ? 'YES' : 'NO');