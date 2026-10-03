/* =====================================================================
   Д-р Панда — талисманът на приложението.
   panda(mood, acc, opts) връща inline SVG низ.
   mood: happy · celebrate · think · sad · surprised · sleep · hero · wave
   acc:  steth · cap · dna · flask · clipboard · microscope · none
   ===================================================================== */
(function () {
'use strict';
var INK = '#1B1F24', BLUSH = '#FF9DB0', GOLD = '#FFC233';

function star(x, y, r, fill) {
  var p = [];
  for (var i = 0; i < 8; i++) { var a = Math.PI / 4 * i - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; p.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1)); }
  return '<polygon points="' + p.join(' ') + '" fill="' + fill + '"/>';
}

function eyes(mood) {
  var patches = '<ellipse cx="46" cy="50" rx="10" ry="12.5" transform="rotate(-24 46 50)" fill="' + INK + '"/>' +
                '<ellipse cx="74" cy="50" rx="10" ry="12.5" transform="rotate(24 74 50)" fill="' + INK + '"/>';
  var e = '';
  if (mood === 'celebrate' || mood === 'hero' || mood === 'wave') {
    e = '<path d="M42.5 51 Q47 45 51.5 51" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M68.5 51 Q73 45 77.5 51" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
  } else if (mood === 'sleep') {
    e = '<path d="M42.5 50 Q47 54 51.5 50" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M68.5 50 Q73 54 77.5 50" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
  } else {
    var r = mood === 'surprised' ? 5.6 : 4.6, px = 0, py = 0.6, pr = mood === 'surprised' ? 2.2 : 2.7;
    if (mood === 'think') { px = 1.4; py = -1.4; }
    if (mood === 'sad') { px = 0; py = 1.4; }
    e = '<circle cx="47" cy="50" r="' + r + '" fill="#fff"/><circle cx="73" cy="50" r="' + r + '" fill="#fff"/>' +
        '<circle cx="' + (47 + px) + '" cy="' + (50 + py) + '" r="' + pr + '" fill="' + INK + '"/>' +
        '<circle cx="' + (73 + px) + '" cy="' + (50 + py) + '" r="' + pr + '" fill="' + INK + '"/>' +
        '<circle cx="' + (48.3 + px) + '" cy="' + (48.6 + py) + '" r="0.9" fill="#fff"/>' +
        '<circle cx="' + (74.3 + px) + '" cy="' + (48.6 + py) + '" r="0.9" fill="#fff"/>';
  }
  var brows = '';
  if (mood === 'sad') brows = '<path d="M38 38 L49 34" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/><path d="M82 38 L71 34" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>';
  if (mood === 'think') brows = '<path d="M39 35 Q44 32 50 35" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M70 33 Q76 30 81 33" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  if (mood === 'surprised') brows = '<path d="M39 33 Q45 29 50 33" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M70 33 Q75 29 81 33" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  return patches + e + brows;
}

function mouth(mood) {
  switch (mood) {
    case 'celebrate': case 'wave':
      return '<path d="M52.5 65 Q60 78 67.5 65 Z" fill="#8A1C2E" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M56 71.5 Q60 75 64 71.5 Q60 69 56 71.5Z" fill="#FF7A90"/>';
    case 'hero': return '<path d="M52 65 Q60 74 68 65" stroke="' + INK + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    case 'think': return '<path d="M55 69 Q60 67 66 69.5" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    case 'sad': return '<path d="M54.5 71 Q60 66 65.5 71" stroke="' + INK + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    case 'surprised': return '<ellipse cx="60" cy="69.5" rx="3.4" ry="4.2" fill="#8A1C2E" stroke="' + INK + '" stroke-width="1.4"/>';
    case 'sleep': return '<path d="M57 68.5 Q60 70.5 63 68.5" stroke="' + INK + '" stroke-width="2" fill="none" stroke-linecap="round"/>';
    default: return '<path d="M54 66 Q60 72.5 66 66" stroke="' + INK + '" stroke-width="2.3" fill="none" stroke-linecap="round"/>';
  }
}

function arms(mood) {
  function arm(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + INK + '" stroke-width="15" stroke-linecap="round"/>' +
           '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#fff" stroke-width="11.5" stroke-linecap="round"/>' +
           '<circle cx="' + x2 + '" cy="' + y2 + '" r="7" fill="' + INK + '"/>';
  }
  if (mood === 'celebrate' || mood === 'hero') return arm(36, 94, 15, 66) + arm(84, 94, 105, 66);
  if (mood === 'wave') return arm(36, 96, 30, 120) + arm(84, 94, 106, 64);
  if (mood === 'think') return arm(36, 96, 30, 120) + arm(84, 96, 74, 80);
  return arm(36, 96, 30, 120) + arm(84, 96, 90, 120);
}

function accessory(acc, mood) {
  switch (acc) {
    case 'steth':
      return '<path d="M47 85 Q44 101 60 107 Q76 101 73 85" stroke="#5B6B7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
             '<line x1="60" y1="107" x2="60" y2="112" stroke="#5B6B7F" stroke-width="2.6"/>' +
             '<circle cx="60" cy="115" r="4.6" fill="#D6DEE8" stroke="#5B6B7F" stroke-width="2"/>';
    case 'cap':
      return '<path d="M44 20 L44 29 Q60 36 76 29 L76 20 Z" fill="#2A3140"/>' +
             '<path d="M60 5 L95 16 L60 27 L25 16 Z" fill="#1F2633" stroke="#11161F" stroke-width="1"/>' +
             '<path d="M60 16 L90 19 L90 33" stroke="' + GOLD + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
             '<circle cx="90" cy="35" r="3.2" fill="' + GOLD + '"/>';
    case 'dna':
      var d = '', i;
      for (i = 0; i < 6; i++) { var y = 74 + i * 8; d += '<line x1="' + (11 + (i % 2 ? 3 : 0)) + '" y1="' + y + '" x2="' + (23 - (i % 2 ? 3 : 0)) + '" y2="' + y + '" stroke="#9AE6C9" stroke-width="2"/>'; }
      return d + '<path d="M10 70 C24 78 24 86 10 94 C-2 102 22 110 22 118" stroke="#12B886" stroke-width="3" fill="none" stroke-linecap="round"/>' +
             '<path d="M24 70 C10 78 10 86 24 94 C36 102 12 110 12 118" stroke="#0EA5E9" stroke-width="3" fill="none" stroke-linecap="round"/>';
    case 'flask':
      return '<path d="M98 84 L98 95 L88 113 Q86 119 92 119 L114 119 Q120 119 118 113 L108 95 L108 84 Z" fill="#F1EDFF" stroke="#5B3FD9" stroke-width="2" stroke-linejoin="round"/>' +
             '<path d="M91 108 L115 108 L118 113 Q120 119 114 119 L92 119 Q86 119 88 113 Z" fill="#8B5CF6"/>' +
             '<circle cx="99" cy="113" r="1.8" fill="#fff" opacity=".8"/><circle cx="105" cy="104" r="1.5" fill="#C4B5FD"/><circle cx="102" cy="98" r="1.1" fill="#C4B5FD"/>' +
             '<rect x="96" y="81" width="14" height="4" rx="1.5" fill="#5B3FD9"/>';
    case 'clipboard':
      return '<rect x="42" y="94" width="26" height="31" rx="3" fill="#C27A2C" stroke="#7C4A12" stroke-width="1.5"/>' +
             '<rect x="45" y="99" width="20" height="23" rx="1.5" fill="#fff"/>' +
             '<rect x="50" y="91" width="10" height="6" rx="2" fill="#9AA5B4"/>' +
             '<path d="M48 104 L51 107 L56 102" stroke="#12B886" stroke-width="1.8" fill="none" stroke-linecap="round"/><line x1="48" y1="112" x2="62" y2="112" stroke="#C7CED8" stroke-width="1.6"/><line x1="48" y1="117" x2="59" y2="117" stroke="#C7CED8" stroke-width="1.6"/>' +
             '<circle cx="52" cy="110" r="6.5" fill="' + INK + '"/>';
    case 'microscope':
      return '<rect x="96" y="114" width="22" height="5" rx="2" fill="#334155"/>' +
             '<path d="M101 114 Q99 104 106 98" stroke="#334155" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
             '<rect x="103" y="80" width="7" height="20" rx="2" transform="rotate(-20 106 90)" fill="#64748B"/>' +
             '<rect x="98" y="104" width="16" height="3" rx="1" fill="#94A3B8"/>';
    default: return '';
  }
}

function extras(mood) {
  switch (mood) {
    case 'celebrate': return star(12, 30, 7, GOLD) + star(108, 34, 6, '#FF7A1A') + star(100, 8, 4.5, '#12B886') + star(20, 8, 4, '#8B5CF6');
    case 'think': return '<text x="96" y="30" font-size="22" font-weight="800" fill="#8B5CF6" font-family="Nunito,sans-serif">?</text>';
    case 'sad': return '<path d="M88 30 Q92 36 88 40 Q84 36 88 30Z" fill="#7DD3FC"/>';
    case 'surprised': return '<text x="94" y="28" font-size="22" font-weight="800" fill="#FF7A1A" font-family="Nunito,sans-serif">!</text>';
    case 'sleep': return '<text x="90" y="30" font-size="13" font-weight="800" fill="#7C83FD" font-family="Nunito,sans-serif">z</text><text x="100" y="17" font-size="18" font-weight="800" fill="#7C83FD" font-family="Nunito,sans-serif">Z</text>';
    case 'hero': return star(14, 22, 6, GOLD) + star(106, 22, 6, GOLD);
    default: return '';
  }
}

window.panda = function (mood, acc, opts) {
  mood = mood || 'happy'; acc = acc == null ? 'steth' : acc; opts = opts || {};
  var scrub = opts.scrub || '#12B886';
  var cape = mood === 'hero' ? '<path d="M32 88 Q18 116 10 129 L110 129 Q102 116 88 88 Z" fill="#FF4D5E"/>' : '';
  var coat =
    '<path d="M27 129 Q26 95 43 84 L77 84 Q94 95 93 129 Z" fill="#fff" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M51 84 L60 101 L69 84 Z" fill="' + scrub + '"/>' +
    '<path d="M51 84 L57 108 M69 84 L63 108" stroke="#C9D2DC" stroke-width="2" fill="none"/>' +
    '<rect x="33" y="106" width="13" height="10" rx="2" fill="none" stroke="#C9D2DC" stroke-width="1.8"/>' +
    '<path d="M37.5 108.5 h4 v2 h2 v4 h-2 v2 h-4 v-2 h-2 v-4 h2z" transform="translate(-0.5 -1.2) scale(1)" fill="#FF4D5E"/>' +
    (mood === 'hero' ? star(78, 110, 7, GOLD) : '');
  var head =
    '<circle cx="31" cy="19" r="12.5" fill="' + INK + '"/><circle cx="89" cy="19" r="12.5" fill="' + INK + '"/>' +
    '<circle cx="31" cy="19" r="5.5" fill="#3A4049"/><circle cx="89" cy="19" r="5.5" fill="#3A4049"/>' +
    '<circle cx="60" cy="48" r="36.5" fill="#fff" stroke="' + INK + '" stroke-width="2.4"/>' +
    eyes(mood) +
    '<ellipse cx="60" cy="60.5" rx="4.8" ry="3.3" fill="' + INK + '"/>' +
    '<ellipse cx="37" cy="64" rx="5.5" ry="3.2" fill="' + BLUSH + '" opacity=".75"/><ellipse cx="83" cy="64" rx="5.5" ry="3.2" fill="' + BLUSH + '" opacity=".75"/>' +
    mouth(mood);
  var cls = 'panda p-' + mood + (opts.cls ? ' ' + opts.cls : '');
  var size = opts.size ? ' style="width:' + opts.size + 'px;height:' + Math.round(opts.size * 130 / 120) + 'px"' : '';
  return '<svg class="' + cls + '"' + size + ' viewBox="0 0 120 130" role="img" aria-label="Д-р Панда">' +
    cape + coat + arms(mood) + (acc === 'cap' ? '' : accessory(acc, mood)) + head + (acc === 'cap' ? accessory(acc, mood) : '') + extras(mood) + '</svg>';
};
})();
