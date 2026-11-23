'use strict';
// Local outline icons: browser SVG, no React, package manager or external CDN.
(() => {
  const paths = {
    crop:'<path d="M6 3v12a3 3 0 0 0 3 3h12M3 6h12a3 3 0 0 1 3 3v12"/>',
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    dashboard:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    bag:'<path d="m6 3-3 4v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7l-3-4Z"/><path d="M3 7h18M9 11a3 3 0 0 0 6 0"/>',
    package:'<path d="m21 8-9 5-9-5M12 13v9M16.5 5.5l-9 5"/><path d="m12 2 9 5v10l-9 5-9-5V7Z"/>',
    image:'<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M19 1v6M16 4h6"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    settings:'<path d="M3 6h4m4 0h10M3 18h10m4 0h4"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="18" r="2"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    'arrow-right':'<path d="M5 12h14m-7-7 7 7-7 7"/>',
    'arrow-left':'<path d="M19 12H5m7-7-7 7 7 7"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>',
    'log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
    check:'<path d="m20 6-11 12-5-5"/>',
    x:'<path d="m18 6-12 12M6 6l12 12"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off':'<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.8M6.5 6.5A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.5-1.5"/>',
    layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
    printer:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6Z"/><path d="M18 12h.01"/>',
    save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
    rotate:'<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7"/>',
    refresh:'<path d="M3 10a9 9 0 0 1 15-6l3 3M21 3v4h-4M21 14a9 9 0 0 1-15 6l-3-3M3 21v-4h4"/>',
    pencil:'<path d="m16 3 5 5L8 21H3v-5Z"/><path d="m14 5 5 5"/>',
    'user-plus':'<circle cx="9" cy="7" r="4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M20 8v6M17 11h6"/>',
    'user-x':'<circle cx="9" cy="7" r="4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m12-13 6 6m0-6-6 6"/>',
    wallet:'<path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6M20 12h-4v5h4M17 14.5h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6ZM8 12l3 3 5-6"/>',
    chart:'<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>'
  };
  Fillico.icon=(name,size=19)=>{
    const key=Object.hasOwn(paths,name)?name:'package';
    const pixels=Number.isInteger(size)&&size>=12&&size<=48?size:19;
    return `<svg class="ui-icon" data-icon="${key}" width="${pixels}" height="${pixels}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
  };
})();
