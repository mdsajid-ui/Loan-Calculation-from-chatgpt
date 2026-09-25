/* ============================================
   DV ANALYTICS – SCRIPT.JS
   Loan EMI & SI Calculator System
   ============================================ */

let scheduleData = [];

/* ---- HELPERS ---- */
function fmt(n) {
  if (isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function parseLocalDate(str) {
  if (!str) return new Date();
  const parts = str.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date(str);
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function days360(d1, d2) {
  let [y1, m1, day1] = [d1.getFullYear(), d1.getMonth() + 1, d1.getDate()];
  let [y2, m2, day2] = [d2.getFullYear(), d2.getMonth() + 1, d2.getDate()];
  if (day1 === 31) day1 = 30;
  if (day2 === 31) day2 = 30;
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1);
}

/* Calculate equivalent annual reducing balance interest rate for a flat rate loan */
function getEquivReducingRate(P, totalRepay, n) {
  const E = totalRepay / n;
  if (E * n <= P || P <= 0 || n <= 0) return '0.00';
  let low = 0.00001, high = 2.0;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    const pv = (E / mid) * (1 - Math.pow(1 + mid, -n));
    if (pv > P) low = mid;
    else high = mid;
  }
  return (((low + high) / 2) * 12 * 100).toFixed(2);
}

/* Retrieve base64 logo safely */
function getCompanyLogoSrc() {
  if (window.DV_LOGO_BASE64) return window.DV_LOGO_BASE64;
  const img = document.getElementById('companyLogo');
  if (img && img.src) return img.src;
  return null;
}

/* ---- SELECTOR SYNCHRONIZATION ---- */
function onProductTypeChange() {
  const pType = document.getElementById('productType').value;
  const iTypeSelect = document.getElementById('interestType');
  if (pType === 'fixed') {
    iTypeSelect.value = 'fixed';
  } else if (pType === 'roi') {
    iTypeSelect.value = 'reducing';
  }
  calculate();
}

function onInterestTypeChange() {
  const iType = document.getElementById('interestType').value;
  const pTypeSelect = document.getElementById('productType');
  if (iType === 'fixed') {
    pTypeSelect.value = 'fixed';
  } else if (pTypeSelect.value === 'fixed') {
    pTypeSelect.value = 'roi';
  }
  calculate();
}

/* ---- DARK MODE TOGGLE ---- */
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  if (scheduleData.length) drawDonut(scheduleData._prinPct || 100, scheduleData._intPct || 0);
}

/* ---- DONUT CHART ---- */
function drawDonut(prinPct, intPct) {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const W = 160, H = 160, cx = W / 2, cy = H / 2, r = 65, inner = 42;

  ctx.clearRect(0, 0, W, H);

  const prinColor = '#4f46e5';
  const intColor  = '#22c55e';
  const total = prinPct + intPct;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
  const P        = parseFloat(document.getElementById('loanAmount').value)   || 0;
  const annualR  = parseFloat(document.getElementById('interestRate').value) || 0;
  const rate     = annualR / 100;
  const n        = parseInt(document.getElementById('tenure').value, 10)      || 0;
  const procFee  = parseFloat(document.getElementById('processingFee').value) || 0;
  const disbDate = parseLocalDate(document.getElementById('disbDate').value);
  const intType  = document.getElementById('interestType') ? document.getElementById('interestType').value : 'reducing';

  if (P <= 0 || n <= 0) {
    return;
  }

  let rows = [];
  let totalInterest = 0;
  let emiDisplay = 0;
  let totalRepay = 0;
  const netDisbursal = Math.max(0, P - procFee);

  const badgeEl = document.getElementById('methodBadge');
  const noticeEl = document.getElementById('equivRateNotice');

  if (intType === 'fixed') {
    // ---- FIXED RATE OF INTEREST (FLAT / SIMPLE INTEREST METHOD) ----
    const tenureYears = n / 12;
    totalInterest = Math.round(P * rate * tenureYears);
    totalRepay = P + totalInterest;
    emiDisplay = Math.round(totalRepay / n);

    const baseMonthlyPrincipal = Math.floor(P / n);
    const baseMonthlyInterest  = Math.floor(totalInterest / n);

    let runningBal = P;
    let accumulatedInterest = 0;

    for (let i = 1; i <= n; i++) {
      const emiDate = addMonths(disbDate, i);
      const openingBal = runningBal;
      let principal, interest;

      if (i === n) {
        // Last month handles exact remainder
        principal = runningBal;
        interest = totalInterest - accumulatedInterest;
      } else {
        principal = baseMonthlyPrincipal;
        interest = baseMonthlyInterest;
      }

      const emiActual = principal + interest;
      const closingBal = Math.max(0, openingBal - principal);

      rows.push({
        sr: i,
        date: emiDate,
        openingBal: openingBal,
        principal: principal,
        interest: interest,
        emi: emiActual,
        closingBal: closingBal,
        pos: closingBal,
        cashflow: emiActual
      });

      runningBal = closingBal;
      accumulatedInterest += interest;
    }

    const equivRate = getEquivReducingRate(P, totalRepay, n);
    if (badgeEl) {
      badgeEl.textContent = 'Fixed Rate (Flat SI)';
      badgeEl.className = 'method-badge fixed';
    }
    if (noticeEl) {
      noticeEl.style.display = 'block';
      noticeEl.innerHTML = `<strong>Fixed Rate (Flat SI):</strong> Total interest of &#8377; ${fmt(totalInterest)} is calculated as simple interest on initial loan amount. <span>Approx. Equivalent Reducing Rate: ~${equivRate}% p.a.</span>`;
    }

  } else {
    // ---- REDUCING BALANCE RATE (DIMINISHING BALANCE METHOD) ----
    const monthlyRate = rate / 12;
    let emi = monthlyRate === 0
      ? P / n
      : P * monthlyRate * Math.pow(1 + monthlyRate, n) / (Math.pow(1 + monthlyRate, n) - 1);
    emi = Math.ceil(emi);
    emiDisplay = emi;

    let runningBal = P;
    let prevDate = disbDate;

    for (let i = 1; i <= n; i++) {
      const emiDate = addMonths(disbDate, i);
      const openingBal = runningBal;
      const d360 = days360(prevDate, emiDate);
      const interest = Math.round(openingBal * rate * d360 / 360);
      const principal = i === n ? openingBal : Math.min(Math.max(0, emi - interest), openingBal);
      const emiActual = principal + interest;
      const closingBal = Math.max(0, openingBal - principal);

      totalInterest += interest;
      rows.push({
        sr: i,
        date: emiDate,
        openingBal: openingBal,
        principal: principal,
        interest: interest,
        emi: emiActual,
        closingBal: closingBal,
        pos: closingBal,
        cashflow: emiActual
      });

      runningBal = closingBal;
      prevDate = emiDate;
    }

    totalRepay = P + totalInterest;

    if (badgeEl) {
      badgeEl.textContent = 'Reducing Balance';
      badgeEl.className = 'method-badge reducing';
    }
    if (noticeEl) {
      noticeEl.style.display = 'none';
      noticeEl.innerHTML = '';
    }
  }

  scheduleData = rows;
  const prinPct = (P / totalRepay) * 100;
  const intPct  = (totalInterest / totalRepay) * 100;
  scheduleData._prinPct = prinPct;
  scheduleData._intPct  = intPct;

  // Update Summary Cards
  document.getElementById('s-emi').textContent       = '₹ ' + fmt(emiDisplay);
  document.getElementById('s-interest').textContent  = '₹ ' + fmt(totalInterest);
  document.getElementById('s-total').textContent     = '₹ ' + fmt(totalRepay);
  document.getElementById('s-disbursal').textContent = '₹ ' + fmt(netDisbursal);

  drawDonut(prinPct, intPct);
  renderTable(rows);
}

/* ---- RENDER TABLE ---- */
function renderTable(rows) {
  const tbody = document.getElementById('amortBody');
  tbody.innerHTML = '';
  let tP = 0, tI = 0, tE = 0;

  rows.forEach(row => {
    tP += row.principal;
    tI += row.interest;
    tE += row.emi;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${row.sr}</td>` +
      `<td>${fmtDate(row.date)}</td>` +
      `<td>${fmt(row.openingBal)}</td>` +
      `<td>${fmt(row.principal)}</td>` +
      `<td>${fmt(row.interest)}</td>` +
      `<td>${fmt(row.emi)}</td>` +
      `<td>${fmt(row.closingBal)}</td>`;
    tbody.appendChild(tr);
  });

  const tot = document.createElement('tr');
  tot.className = 'total-row';
  tot.innerHTML =
    `<td colspan="2">Total</td>` +
    `<td>–</td>` +
    `<td>${fmt(tP)}</td>` +
    `<td>${fmt(tI)}</td>` +
    `<td>${fmt(tE)}</td>` +
    `<td>0</td>`;
  tbody.appendChild(tot);
}

/* ---- SEARCH / FILTER ---- */
function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!scheduleData.length) return;
  const filtered = scheduleData.filter(row =>
    fmtDate(row.date).includes(q) ||
    String(row.sr).includes(q) ||
    fmt(row.openingBal).includes(q) ||
    fmt(row.emi).includes(q) ||
    fmt(row.principal).includes(q) ||
    fmt(row.interest).includes(q) ||
    fmt(row.closingBal).includes(q)
  );
  renderTable(filtered);
}

/* ---- EXPORT EXCEL ---- */
function exportExcel() {
  if (!scheduleData.length) { alert('Please calculate first.'); return; }

  const P        = parseFloat(document.getElementById('loanAmount').value)   || 0;
  const annualR  = parseFloat(document.getElementById('interestRate').value) || 0;
  const n        = parseInt(document.getElementById('tenure').value, 10)      || 0;
  const intType  = document.getElementById('interestType') ? document.getElementById('interestType').value : 'reducing';
  const typeText = intType === 'fixed' ? 'Fixed Rate (Flat SI)' : 'Reducing Balance';

  const wsData = [
    ['DV ANALYTICS - LOAN REPAYMENT & AMORTIZATION SCHEDULE'],
    [`Loan Amount: Rs. ${fmt(P)}`, `Tenure: ${n} Months`, `Interest Rate: ${annualR}% p.a.`, `Method: ${typeText}`],
    [],
    ['Sr. No.', 'Due Date', 'Opening Balance (Rs)', 'Principal (Rs)', 'Interest (Rs)', 'Monthly EMI (Rs)', 'Closing Balance (Rs)']
  ];

  let tP = 0, tI = 0, tE = 0;
  scheduleData.forEach(r => {
    tP += r.principal;
    tI += r.interest;
    tE += r.emi;
    wsData.push([r.sr, fmtDate(r.date), r.openingBal, r.principal, r.interest, r.emi, r.closingBal]);
  });
  wsData.push(['Total', '-', '-', tP, tI, tE, 0]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [8, 14, 20, 16, 16, 16, 20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Amortization');
  XLSX.writeFile(wb, `DV_Analytics_Schedule_${intType}.xlsx`);
}

/* ---- DOWNLOAD PROFESSIONAL PDF REPORT ---- */
function downloadPDF() {
  if (!scheduleData.length) { alert('Please calculate first.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const P        = parseFloat(document.getElementById('loanAmount').value)   || 0;
  const annualR  = parseFloat(document.getElementById('interestRate').value) || 0;
  const n        = parseInt(document.getElementById('tenure').value, 10)      || 0;
  const procFee  = parseFloat(document.getElementById('processingFee').value) || 0;
  const disbDate = parseLocalDate(document.getElementById('disbDate').value);
  const intType  = document.getElementById('interestType') ? document.getElementById('interestType').value : 'reducing';

  const emiText      = document.getElementById('s-emi').textContent;
  const interestText = document.getElementById('s-interest').textContent;
  const totalText    = document.getElementById('s-total').textContent;
  const netDisbText  = document.getElementById('s-disbursal').textContent;

  const totalRepay = P + (scheduleData.reduce((acc, r) => acc + r.interest, 0));
  const equivRate  = intType === 'fixed' ? getEquivReducingRate(P, totalRepay, n) : null;
  const methodLabel = intType === 'fixed' ? 'Fixed Rate (Flat / Simple Interest)' : 'Reducing Balance Rate (Diminishing)';

  // 1. COMPANY LOGO (Top Left)
  const logoData = getCompanyLogoSrc();
  if (logoData) {
    try {
      // 42mm wide x 17.76mm high matches the 768:325 aspect ratio
      doc.addImage(logoData, 'PNG', 14, 9, 42, 17.76);
    } catch (e) {
      console.warn('Could not add logo to PDF:', e);
    }
  }

  // 2. REPORT HEADER & COMPANY BRANDING
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(13, 27, 62);
  doc.text('DV ANALYTICS', 60, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Transforming You  |  Institute & Student Loan Amortization Schedule', 60, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(79, 70, 229);
  doc.text('LOAN REPAYMENT & AMORTIZATION SCHEDULE REPORT', 60, 26.5);

  // Top-Right Metadata Block
  const today = new Date();
  const dateStr = fmtDate(today);
  const refId = `DVA-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${dateStr}`, 283, 15, { align: 'right' });
  doc.text(`Reference: ${refId}`, 283, 19.5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(intType === 'fixed' ? 180 : 79, intType === 'fixed' ? 83 : 70, intType === 'fixed' ? 9 : 229);
  doc.text(`Calculation: ${intType === 'fixed' ? 'Fixed Rate (Flat SI)' : 'Reducing Balance'}`, 283, 24, { align: 'right' });

  // Accent Divider Line
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.6);
  doc.line(14, 29.5, 283, 29.5);

  // 3. EXECUTIVE SUMMARY PANELS (Side-by-side Cards)
  // Panel A: Loan Facility Details (Left)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, 32, 132, 25, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('LOAN FACILITY PARAMETERS', 18, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Principal Loan Amount:', 18, 43);
  doc.text('Loan Tenure:', 18, 48);
  doc.text('Interest Rate (% p.a.):', 18, 53);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`₹ ${fmt(P)}`, 62, 43);
  doc.text(`${n} Months (${(n / 12).toFixed(1)} Yrs)`, 62, 48);
  doc.text(`${annualR}% p.a.`, 62, 53);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Disbursement Date:', 84, 43);
  doc.text('Processing / Other Fee:', 84, 48);
  doc.text('Net Disbursal Amount:', 84, 53);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(fmtDate(disbDate), 126, 43);
  doc.text(`₹ ${fmt(procFee)}`, 126, 48);
  doc.text(netDisbText, 126, 53);

  // Panel B: Financial Repayment Summary (Right)
  doc.setFillColor(245, 243, 255);
  doc.setDrawColor(196, 181, 253);
  doc.roundedRect(151, 32, 132, 25, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(67, 56, 202);
  doc.text('FINANCIAL REPAYMENT SUMMARY', 155, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Monthly EMI Installment:', 155, 43);
  doc.text('Total Interest Payable:', 155, 48);
  doc.text('Total Repayment Amount:', 155, 53);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(67, 56, 202);
  doc.text(emiText, 202, 43);

  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(interestText, 202, 48);
  doc.text(totalText, 202, 53);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Calculation Method:', 222, 43);
  doc.text('Equiv. Reducing Rate:', 222, 48);
  doc.text('Principal / Interest Ratio:', 222, 53);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(intType === 'fixed' ? 'Fixed Rate' : 'Reducing Rate', 262, 43);
  doc.text(intType === 'fixed' ? `~${equivRate}% p.a.` : 'Standard', 262, 48);
  doc.text(`${Math.round(scheduleData._prinPct || 0)}% / ${Math.round(scheduleData._intPct || 0)}%`, 262, 53);

  // 4. INFORMATIVE METHOD EXPLANATION CALLOUT
  if (intType === 'fixed') {
    doc.setFillColor(254, 249, 195);
    doc.setDrawColor(253, 224, 71);
    doc.roundedRect(14, 59.5, 269, 6.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(133, 77, 14);
    doc.text(
      `ℹ️ Fixed Rate of Interest (Flat SI): Total interest of ₹ ${fmt(scheduleData.reduce((a, r) => a + r.interest, 0))} is computed simply on the initial loan amount over the full tenure. The approximate equivalent reducing rate (APR) is ~${equivRate}% p.a.`,
      17,
      64
    );
  } else {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(14, 59.5, 269, 6.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 64, 175);
    doc.text(
      `ℹ️ Reducing Balance Method: Interest is computed monthly on the diminishing principal outstanding balance (POS). Monthly interest decreases as principal is paid.`,
      17,
      64
    );
  }

  // 5. AMORTIZATION SCHEDULE TABLE
  const tableHead = [[
    'No.',
    'Due Date',
    'Opening Balance (₹)',
    'Principal Paid (₹)',
    'Interest Paid (₹)',
    'Monthly EMI (₹)',
    'Closing Balance (₹)'
  ]];

  let totP = 0, totI = 0, totE = 0;
  const tableBody = scheduleData.map(r => {
    totP += r.principal;
    totI += r.interest;
    totE += r.emi;
    return [
      r.sr,
      fmtDate(r.date),
      fmt(r.openingBal),
      fmt(r.principal),
      fmt(r.interest),
      fmt(r.emi),
      fmt(r.closingBal)
    ];
  });

  const tableFoot = [[
    'Total',
    '–',
    '–',
    `₹ ${fmt(totP)}`,
    `₹ ${fmt(totI)}`,
    `₹ ${fmt(totE)}`,
    '₹ 0'
  ]];

  doc.autoTable({
    head: tableHead,
    body: tableBody,
    foot: tableFoot,
    startY: 68.5,
    margin: { left: 14, right: 14, bottom: 16 },
    headStyles: {
      fillColor: [13, 27, 62],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      cellPadding: 2.2
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 1.8
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    footStyles: {
      fillColor: [237, 233, 254],
      textColor: [67, 56, 202],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.2
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 45.6, halign: 'right' },
      3: { cellWidth: 45.6, halign: 'right' },
      4: { cellWidth: 45.6, halign: 'right' },
      5: { cellWidth: 45.6, halign: 'right' },
      6: { cellWidth: 45.6, halign: 'right' }
    },
    didDrawPage: function(data) {
      // Repeat Header on Page 2+
      if (data.pageNumber > 1) {
        if (logoData) {
          try {
            doc.addImage(logoData, 'PNG', 14, 5, 25, 10.57);
          } catch (e) {}
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(13, 27, 62);
        doc.text('DV ANALYTICS – AMORTIZATION SCHEDULE REPORT (CONTINUED)', 42, 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Loan: ₹ ${fmt(P)}  |  Tenure: ${n}M  |  Rate: ${annualR}% (${intType})`, 283, 11, { align: 'right' });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(14, 15, 283, 15);
      }
    }
  });

  // 6. PROFESSIONAL FOOTER ON ALL PAGES
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, 200, 283, 200);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('DV Analytics  •  Transforming You  •  Institute & Student Loan Management System', 14, 204.5);
    doc.text('Confidential  •  Generated for Official Assessment & Reference Purposes', 148.5, 204.5, { align: 'center' });
    doc.text(`Page ${i} of ${totalPages}`, 283, 204.5, { align: 'right' });
  }

  doc.save(`DV_Analytics_Loan_Report_${intType}.pdf`);
}

/* ---- ON LOAD ---- */
window.onload = function() {
  const disbInput = document.getElementById('disbDate');
  if (!disbInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm   = String(today.getMonth() + 1).padStart(2, '0');
    const dd   = String(today.getDate()).padStart(2, '0');
    disbInput.value = `${yyyy}-${mm}-${dd}`;
  }
  calculate();
};
