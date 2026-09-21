'use strict';
// Keep simulation balances in their existing units; all player-facing amounts
// use the same conversion, including income, research and refunds.
function money(points){return Math.floor(points*DATA.currency.perPoint+1e-7).toLocaleString('zh-CN');}
