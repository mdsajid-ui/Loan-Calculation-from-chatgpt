/* ============================================
   AUXILO v2 – SCRIPT.JS
   ============================================ */

let scheduleData = [];

/* ---- HELPERS ---- */
function fmt(n) { return Math.round(n).toLocaleString('en-IN'); }

function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function days360(d1, d2) {
  let [y1,m1,day1] = [d1.getFullYear(), d1.getMonth()+1, d1.getDate()];
  let [y2,m2,day2] = [d2.getFullYear(), d2.getMonth()+1, d2.getDate()];
  if (day1===31) day1=30;
  if (day2===31) day2=30;
  return (y2-y1)*360 + (m2-m1)*30 + (day2-day1);
}

/* ---- DARK MODE TOGGLE ---- */
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  // Redraw chart with new colors
  if (scheduleData.length) drawDonut(scheduleData._prinPct || 100, scheduleData._intPct || 0);
}

/* ---- DONUT CHART ---- */
function drawDonut(prinPct, intPct) {
  const canvas = document.getElementById('donutChart');
  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const W = 160, H = 160, cx = W/2, cy = H/2, r = 65, inner = 42;

  ctx.clearRect(0, 0, W, H);

  const prinColor = '#4f46e5';
  const intColor  = '#22c55e';
  const total = prinPct + intPct;

  if (total === 0) {
    // Empty gray ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.lineWidth = inner;
    ctx.strokeStyle = isDark ? '#2d3148' : '#e5e7eb';
    ctx.stroke();
    return;
  }

  const startAngle = -Math.PI / 2;
  const prinAngle  = (prinPct / total) * Math.PI * 2;
  const intAngle   = (intPct  / total) * Math.PI * 2;

  // Principal arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, startAngle + prinAngle);
  ctx.lineWidth = inner;
  ctx.strokeStyle = prinColor;
  ctx.lineCap = 'butt';
  ctx.stroke();

  // Interest arc
  if (intAngle > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle + prinAngle, startAngle + prinAngle + intAngle);
    ctx.lineWidth = inner;
    ctx.strokeStyle = intColor;
    ctx.stroke();
  }

  // Update center text & legend
  const bigPct = prinPct >= intPct ? Math.round(prinPct) : Math.round(intPct);
  const bigLbl = prinPct >= intPct ? 'Principal' : 'Interest';
  document.getElementById('chartPct').textContent = bigPct + '%';
  document.getElementById('chartLbl').textContent = bigLbl;
  document.getElementById('legPrinPct').textContent = Math.round(prinPct) + '%';
  document.getElementById('legIntPct').textContent  = Math.round(intPct)  + '%';
}

/* ---- MAIN CALCULATE ---- */
function calculate() {
  const P    = parseFloat(document.getElementById('loanAmount').value)  || 0;
  const rate = parseFloat(document.getElementById('interestRate').value) / 100 || 0;
  const n    = parseInt(document.getElementById('tenure').value)         || 0;
  const disbDate = new Date(document.getElementById('disbDate').value);

  if (P <= 0 || n <= 0) { alert('Please enter a valid Loan Amount and Tenure.'); return; }

  const monthlyRate = rate / 12;
  let emi = monthlyRate === 0
    ? P / n
    : P * monthlyRate * Math.pow(1+monthlyRate, n) / (Math.pow(1+monthlyRate, n) - 1);
  emi = Math.ceil(emi);

  let balance = P, totalInterest = 0;
  const rows = [];
  let prevDate = disbDate;

  for (let i = 1; i <= n; i++) {
    const emiDate  = addMonths(disbDate, i);
    const d360     = days360(prevDate, emiDate);
    const interest = Math.round(balance * rate * d360 / 360);
    const principal = i === n ? balance : Math.min(Math.max(0, emi - interest), balance);
    const emiActual = principal + interest;
    const pos = Math.round(balance - principal);

    totalInterest += interest;
    rows.push({ sr:i, date:emiDate, pos, interest, principal, emi:emiActual, cashflow:emiActual });
    balance -= principal;
    prevDate = emiDate;
  }

  scheduleData = rows;
  const totalRepay = P + totalInterest;
  const prinPct = (P / totalRepay) * 100;
  const intPct  = (totalInterest / totalRepay) * 100;
  scheduleData._prinPct = prinPct;
  scheduleData._intPct  = intPct;

  // Summary
  document.getElementById('s-emi').textContent      = '₹ ' + fmt(emi);
  document.getElementById('s-interest').textContent = '₹ ' + fmt(totalInterest);
  document.getElementById('s-total').textContent    = '₹ ' + fmt(totalRepay);
  document.getElementById('s-disbursal').textContent= '₹ ' + fmt(P);

  drawDonut(prinPct, intPct);
  renderTable(rows);
}

/* ---- RENDER TABLE ---- */
function renderTable(rows) {
  const tbody = document.getElementById('amortBody');
  tbody.innerHTML = '';
  let tI=0, tP=0, tE=0, tC=0;

  rows.forEach(row => {
    tI+=row.interest; tP+=row.principal; tE+=row.emi; tC+=row.cashflow;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${row.sr}</td><td>${fmtDate(row.date)}</td><td>${fmt(row.pos)}</td>` +
      `<td>${fmt(row.interest)}</td><td>${fmt(row.principal)}</td>` +
      `<td>${fmt(row.emi)}</td><td>${fmt(row.cashflow)}</td>`;
    tbody.appendChild(tr);
  });

  const tot = document.createElement('tr');
  tot.className = 'total-row';
  tot.innerHTML =
    `<td colspan="2">Total</td><td>–</td>` +
    `<td>${fmt(tI)}</td><td>${fmt(tP)}</td><td>${fmt(tE)}</td><td>${fmt(tC)}</td>`;
  tbody.appendChild(tot);
}

/* ---- SEARCH / FILTER ---- */
function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  if (!scheduleData.length) return;
  const filtered = scheduleData.filter(row =>
    fmtDate(row.date).includes(q) ||
    String(row.sr).includes(q) ||
    fmt(row.emi).includes(q) ||
    fmt(row.principal).includes(q) ||
    fmt(row.interest).includes(q)
  );
  renderTable(filtered);
}

/* ---- EXPORT EXCEL ---- */
function exportExcel() {
  if (!scheduleData.length) { alert('Please calculate first.'); return; }

  const wsData = [['Sr. No.','Date','POS (Rs)','Interest (Rs)','Principal (Rs)','EMI (Rs)','Cashflow (Rs)']];
  scheduleData.forEach(r => {
    wsData.push([r.sr, fmtDate(r.date), Math.round(r.pos), r.interest, r.principal, r.emi, r.cashflow]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [8,12,12,14,14,10,12].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Amortization');
  XLSX.writeFile(wb, 'Auxilo_Schedule.xlsx');
}

/* ---- DOWNLOAD PDF ---- */
function downloadPDF() {
  if (!scheduleData.length) { alert('Please calculate first.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.setTextColor(13, 27, 62);
  doc.text('AUXILO – EMI & SI Calculator Report', 14, 16);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`EMI: ${document.getElementById('s-emi').textContent}   |   Total Interest: ${document.getElementById('s-interest').textContent}   |   Total Repayment: ${document.getElementById('s-total').textContent}`, 14, 24);

  const head = [['Sr.','Date','POS (₹)','Interest (₹)','Principal (₹)','EMI (₹)','Cashflow (₹)']];
  const body = scheduleData.map(r => [r.sr, fmtDate(r.date), fmt(r.pos), fmt(r.interest), fmt(r.principal), fmt(r.emi), fmt(r.cashflow)]);

  doc.autoTable({
    head, body,
    startY: 30,
    headStyles: { fillColor: [90, 85, 214], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  doc.save('Auxilo_Report.pdf');
}

/* ---- ON LOAD ---- */
window.onload = function() {
  // Set today's date as default
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm   = String(today.getMonth()+1).padStart(2,'0');
  const dd   = String(today.getDate()).padStart(2,'0');
  document.getElementById('disbDate').value = `${yyyy}-${mm}-${dd}`;
  calculate();
};
