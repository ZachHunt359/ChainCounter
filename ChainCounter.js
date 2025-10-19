let storedData = null;
let storedResults = null;
let jumperId = 0; // Default to main jumper

// Only attach DOM event listeners when running in a browser (document exists)
if (typeof document !== 'undefined') {
  document.getElementById('uploadButton').addEventListener('click', () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
      alert('Please select a file first!');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        storedData = JSON.parse(event.target.result);
        populateDropdowns();
        populateJumperDropdown(storedData);
        document.getElementById('generateTableButton').disabled = false;
        // Do not generate table yet!
      } catch (error) {
        alert('Error parsing JSON file: ' + error.message);
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('generateTableButton').addEventListener('click', () => {
    if (!storedData) {
      alert('Please upload a file first!');
      return;
    }
    jumperId = Number(document.getElementById('jumperSelect').value);
    const { jumpTotals, jumpNames, jumpSupplements, jumpOrder, altFormsByCharacterAndJump } = processPurchases(storedData, jumperId);
    const exterminationValues = {};
    storedResults = displayResults(
      jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder, altFormsByCharacterAndJump, jumperId
    );
  });
}

function processPurchases(data, jumperId = 0) {
  const typeMappings = { 1: 'Items', 3: 'Drawbacks' };
  const jumpTotals = {};
  const jumpNames = {};
  const jumpSupplements = {};
  const altFormsByCharacterAndJump = {};

  if (data.jumps) {
    for (const [jumpId, jumpData] of Object.entries(data.jumps)) {
      jumpNames[jumpId] = jumpData.name || `Jump ${jumpId}`;
      jumpSupplements[jumpId] = jumpData.hasOwnProperty('parentJump');
    }
  }

  if (data.purchases) {
    for (const purchase of Object.values(data.purchases)) {
      if (purchase._characterId === jumperId) { // Use id for selected jumper
        const jumpId = purchase._jumpId;
        const itemType = purchase._type;

        if (!jumpTotals[jumpId]) {
          jumpTotals[jumpId] = { Items: 0, AltForms: 0, Drawbacks: 0, Exterminations: 0 };
        }

        // Only count items that are NOT temporary (duration !== 1)
        if (itemType === 1) {
          if (purchase.duration !== 1) {
            jumpTotals[jumpId].Items += 1;
          }
        } else if (itemType === 3) {
          jumpTotals[jumpId].Drawbacks += 1;
        }
      }
    }
  }

  // Build altFormsByCharacterAndJump
  if (data.altforms) {
    for (const altForm of Object.values(data.altforms)) {
      const characterId = Number(altForm.characterId);
      const jumpId = altForm.jumpId;
      if (!altFormsByCharacterAndJump[characterId]) {
        altFormsByCharacterAndJump[characterId] = {};
      }
      if (!altFormsByCharacterAndJump[characterId][jumpId]) {
        altFormsByCharacterAndJump[characterId][jumpId] = [];
      }
      altFormsByCharacterAndJump[characterId][jumpId].push(altForm);
    }
  }

  const jumpOrder = data.jumpList || Object.keys(jumpNames);

  return { jumpTotals, jumpNames, jumpSupplements, jumpOrder, altFormsByCharacterAndJump };
}

// Helper: normalize years/months/days (30 days = 1 month, 12 months = 1 year)
function normalizeYMD(yrs, mons, dys) {
  let daysCarry = Math.floor(dys / 30);
  mons += daysCarry;
  dys = dys % 30;
  let yearsCarry = Math.floor(mons / 12);
  yrs += yearsCarry;
  mons = mons % 12;
  return { yrs, mons, dys };
}

function formatShortYMD(yrs, mons, dys) {
  const parts = [];
  if (yrs) parts.push(yrs + 'y');
  if (mons) parts.push(mons + 'm');
  if (dys) {
    // Clean small floating point artifacts for short form as well
    const clean = cleanFloat(dys);
    parts.push(clean + 'd');
  }
  return parts.join(' ') || '';
}

// Helper to trim insignificant floating-point noise
function cleanFloat(n) {
  const num = Number(n) || 0;
  if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
  const trimmed = parseFloat(num.toFixed(10));
  return String(trimmed);
}

function formatLongYMD(yrs, mons, dys) {
  const parts = [];
  if (yrs) parts.push(`${yrs} year${yrs === 1 ? '' : 's'}`);
  if (mons) parts.push(`${mons} month${mons === 1 ? '' : 's'}`);
  if (dys) {
    // Use raw dys value for formatting in internal representations/tests.
    // UI will use a pretty formatter to trim insignificant float noise.
    parts.push(`${dys} day${dys === 1 ? '' : 's'}`);
  }
  return parts.join(', ') || '0 days';
}

// Pretty formatter: trims insignificant floating-point noise for UI display
function formatLongYMDPretty(yrs, mons, dys) {
  const parts = [];
  if (yrs) parts.push(`${yrs} year${yrs === 1 ? '' : 's'}`);
  if (mons) parts.push(`${mons} month${mons === 1 ? '' : 's'}`);
  if (dys) {
    const cleanFloat = (n) => {
      const num = Number(n) || 0;
      if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
      const trimmed = parseFloat(num.toFixed(10));
      return String(trimmed);
    };
    const dysStr = cleanFloat(dys);
    const dysNum = parseFloat(dysStr);
    parts.push(`${dysStr} day${dysNum === 1 ? '' : 's'}`);
  }
  return parts.join(', ') || '0 days';
}

// Compute cumulative per-jump durations and ages for two modes: 'chainmaker' or 'timepassing'
function computePerJumpAccumulations(characterId, data, jumpOrder, mode, includeSupplementsInTime = true) {
  const jumps = data.jumps || {};
  const chars = data.characters || {};
  const originalAgeRaw = (chars[characterId] && chars[characterId].originalAge) || chars[characterId]?.age || 0;
  const originalAge = parseInt(originalAgeRaw, 10) || 0;

  const isImported = (jumpId) => {
    const j = jumps[jumpId];
    if (!j) return false;
    if (Array.isArray(j.characters)) return j.characters.map(String).includes(String(characterId));
    return false;
  };

  // For timepassing, find the start index (first import, with supplement->parentJump fallback)
  let startIndex = -1;
  if (mode === 'timepassing') {
    const firstImport = jumpOrder.findIndex(jId => isImported(jId));
    if (firstImport !== -1) {
      let startJumpId = jumpOrder[firstImport];
      const j = jumps[startJumpId];
      if (j && Object.prototype.hasOwnProperty.call(j, 'parentJump') && j.parentJump !== undefined && j.parentJump !== null) {
        startJumpId = String(j.parentJump);
      }
      startIndex = jumpOrder.indexOf(String(startJumpId));
      if (startIndex === -1) startIndex = firstImport;
    }
  }

  const results = {};
  let cumY = 0, cumM = 0, cumD = 0;

  for (let i = 0; i < jumpOrder.length; i++) {
    const jId = jumpOrder[i];
    const j = jumps[jId];
  const yrs = (j && j.duration && parseInt(j.duration.years, 10)) || 0;
  const mons = (j && j.duration && parseInt(j.duration.months, 10)) || 0;
  // allow fractional days in durations (e.g. 0.1)
  const dys = (j && j.duration && (j.duration.days !== undefined) ) ? parseFloat(j.duration.days) || 0 : 0;

    const isSupp = !!(j && Object.prototype.hasOwnProperty.call(j, 'parentJump') && j.parentJump !== undefined && j.parentJump !== null);

    let include = false;
    if (mode === 'chainmaker') {
      include = (Number(characterId) === 0) ? true : isImported(jId);
      // If this is a supplement and includeSupplementsInTime is false, do not include it
      if (isSupp && !includeSupplementsInTime) include = false;
    } else if (mode === 'timepassing') {
      include = (startIndex !== -1 && i >= startIndex);
      // For timepassing we also respect the includeSupplementsInTime flag
      if (isSupp && !includeSupplementsInTime) include = false;
    }

    if (include) {
      cumY += yrs;
      cumM += mons;
      cumD += dys;
      const norm = normalizeYMD(cumY, cumM, cumD);
      cumY = norm.yrs; cumM = norm.mons; cumD = norm.dys;
    }

    // Age at this point = originalAge + cumY (months/days carried into years already)
    const ageY = originalAge + cumY;
    // For full formatted age, carry months/days from cumM/cumD
    const ageNorm = normalizeYMD(ageY, cumM, cumD);

    results[jId] = {
      included: include,
      cumulative: { years: cumY, months: cumM, days: cumD },
      cumulativeShort: formatShortYMD(cumY, cumM, cumD),
      cumulativeLong: formatLongYMD(cumY, cumM, cumD),
      cumulativeLongPretty: formatLongYMDPretty(cumY, cumM, cumD),
      ageShort: formatShortYMD(ageNorm.yrs, ageNorm.mons, ageNorm.dys),
      ageLong: formatLongYMD(ageNorm.yrs, ageNorm.mons, ageNorm.dys),
      ageLongPretty: formatLongYMDPretty(ageNorm.yrs, ageNorm.mons, ageNorm.dys)
    };
  }

  return results;
}

// In displayResults, use altFormsByCharacterAndJump[0][jumpId] for main jumper's alt-forms:
function displayResults(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder, altFormsByCharacterAndJump, jumperId = 0) {
  const resultsTableBody = document.getElementById('resultsTableBody');
  resultsTableBody.innerHTML = '';

  let jumpCount = 0;
  const resultsArray = [];
  let totalItems = 0;
  let totalAltForms = 0;
  let totalDrawbacks = 0;
  let totalExterminations = 0;
  let totalItemsPT = 0;
  let totalAltFormsPT = 0;
  let totalDrawbacksPT = 0;
  let totalExterminationsPT = 0;
  let totalPT = 0;

  const packRatPT = parseInt(document.getElementById('packRatPT').value, 10);
  const packRatCount = parseInt(document.getElementById('packRatCount').value, 10);
  const thousandFacesPT = parseInt(document.getElementById('thousandFacesPT').value, 10);
  const thousandFacesCount = parseInt(document.getElementById('thousandFacesCount').value, 10);
  const drawbackTakerPT = parseInt(document.getElementById('drawbackTakerPT').value, 10);
  const drawbackTakerCount = parseInt(document.getElementById('drawbackTakerCount').value, 10);
  const exterminatorsPT = parseInt(document.getElementById('exterminatorsPT').value, 10);
  const exterminatorsCount = parseInt(document.getElementById('exterminatorsCount').value, 10);

  let accumulatedItemsPT = 0;
  let accumulatedAltFormsPT = 0;
  let accumulatedDrawbacksPT = 0;
  let accumulatedExterminationsPT = 0;

  console.log("Jump Totals:", jumpTotals);
  
  const orderedResults = jumpOrder.map(jumpId => ({
    jumpId,
    jumpName: jumpNames[jumpId] || `Jump ${jumpId}`,
    totals: jumpTotals[jumpId] || { Items: 0, AltForms: 0, Drawbacks: 0, Exterminations: 0 }
  }));

  console.log("Ordered Results:", orderedResults);

  for (const result of orderedResults) {
    const { jumpId, jumpName, totals } = result;
    const row = document.createElement('tr');
    const isSupplement = jumpSupplements[jumpId];

    if (!isSupplement) {
      jumpCount += 1;
    }

    totalItems += totals.Items;
    totalDrawbacks += totals.Drawbacks;
    totalExterminations += exterminationValues[jumpId] || totals.Exterminations;

    // Count main jumper's alt-forms for this jump
    const altFormsCount = (altFormsByCharacterAndJump[jumperId] && altFormsByCharacterAndJump[jumperId][jumpId])
      ? altFormsByCharacterAndJump[jumperId][jumpId].length
      : 0;

    // Add altFormsCount BEFORE calculating altFormsPT
    totalAltForms += altFormsCount;

    const itemsPT = Math.floor(totalItems / packRatCount) * packRatPT - accumulatedItemsPT;
    const altFormsPT = Math.floor(totalAltForms / thousandFacesCount) * thousandFacesPT - accumulatedAltFormsPT;
    const drawbacksPT = Math.floor(totalDrawbacks / drawbackTakerCount) * drawbackTakerPT - accumulatedDrawbacksPT;
    const exterminationsPT = Math.floor(totalExterminations / exterminatorsCount) * exterminatorsPT - accumulatedExterminationsPT;

    accumulatedItemsPT += itemsPT;
    accumulatedAltFormsPT += altFormsPT;
    accumulatedDrawbacksPT += drawbacksPT;
    accumulatedExterminationsPT += exterminationsPT;

    const rowTotalPT = itemsPT + altFormsPT + drawbacksPT + exterminationsPT;

    totalItemsPT += itemsPT;
    totalAltFormsPT += altFormsPT;
    totalDrawbacksPT += drawbacksPT;
    totalExterminationsPT += exterminationsPT;
    totalPT += rowTotalPT;

    const exterminationsValue = exterminationValues[jumpId] || totals.Exterminations;

    const rowData = [
      !isSupplement ? jumpCount : '',
      jumpNames[jumpId] || `Jump ${jumpId}`,
      `<span class="PTcount">${rowTotalPT}</span>`,
      totals.Items,
      `<span class="PTcount">${itemsPT}</span>`,
      altFormsCount,
      `<span class="PTcount">${altFormsPT}</span>`,
      totals.Drawbacks,
      `<span class="PTcount">${drawbacksPT}</span>`,
      `<input type="number" min="0" value="${exterminationsValue}" class="exterminations-input" data-jump-id="${jumpId}">`,
      `<span class="PTcount">${exterminationsPT}</span>`
    ];

    row.innerHTML = `
      <td>${rowData[0]}</td>
      <td class="jump-name ${isSupplement ? 'supplement' : ''}">${rowData[1]}</td>
      <td>${rowData[2]}</td>
      <td>${rowData[3]}</td>
      <td>${rowData[4]}</td>
      <td>${rowData[5]}</td>
      <td>${rowData[6]}</td>
      <td>${rowData[7]}</td>
      <td>${rowData[8]}</td>
      <td>${rowData[9]}</td>
      <td>${rowData[10]}</td>
    `;
    resultsTableBody.appendChild(row);

    resultsArray.push(rowData);
  }
  // Show age info for the selected jumper above the table (if running in browser)
  if (typeof document !== 'undefined') {
    try {
      const container = document.getElementById('resultsContainer');
      if (container) {
        // Create or update the age info wrapper
        let ageWrap = container.querySelector('#ageInfoWrap');
        const ages = getCharacterAges(jumperId, storedData || {});

        if (!ageWrap) {
          ageWrap = document.createElement('div');
          ageWrap.id = 'ageInfoWrap';
          ageWrap.style.marginBottom = '8px';

          // Structured fields
          const labelRow = document.createElement('div');
          labelRow.innerHTML = `
            <strong>Selected jumper ages</strong>
          `;
          ageWrap.appendChild(labelRow);

          const table = document.createElement('table');
          table.id = 'ageSummaryTable';
          table.style.borderCollapse = 'collapse';
          table.style.marginTop = '6px';
          table.innerHTML = `
            <tbody>
              <tr><td id="ageLabel_original">Original</td><td id="ageValue_original"></td></tr>
              <tr><td id="ageLabel_chainmaker">ChainMaker-style</td><td id="ageValue_chainmaker"></td></tr>
              <tr><td id="ageLabel_timepassing">Time-passing</td><td id="ageValue_timepassing"></td></tr>
            </tbody>
          `;

          ageWrap.appendChild(table);

          // Collapsible breakdown
          // Controls: two buttons to toggle ChainMaker vs Time-passing breakdowns
          const controls = document.createElement('div');
          controls.style.marginTop = '6px';
          // Checkbox to toggle whether supplement time counts towards Time-passing totals
          const suppToggleLabel = document.createElement('label');
          suppToggleLabel.style.marginRight = '12px';
          suppToggleLabel.style.cursor = 'pointer';
          const suppToggle = document.createElement('input');
          suppToggle.type = 'checkbox';
          suppToggle.id = 'countSupplementsCB';
          suppToggle.checked = false; // default: do not count supplements
          suppToggle.setAttribute('aria-label', 'Count supplement time as part of age');
          suppToggleLabel.appendChild(suppToggle);
          suppToggleLabel.appendChild(document.createTextNode(' Count supplement time as part of age'));
          // Tooltip explaining behavior
          suppToggleLabel.title = "Checked = You use the Years/Months/Days fields in your Supplement to record time that passes for your jumper.\nUnchecked = You ignore those fields for Supplements, and put all time you care about in the Jumps themselves.";
          controls.insertBefore(suppToggleLabel, controls.firstChild);
          const btnChain = document.createElement('button');
          btnChain.type = 'button';
          btnChain.id = 'ageBreakChainBtn';
          btnChain.textContent = 'Show ChainMaker breakdown';
          const btnTime = document.createElement('button');
          btnTime.type = 'button';
          btnTime.id = 'ageBreakTimeBtn';
          btnTime.textContent = 'Show Time-passing breakdown';
          controls.appendChild(btnChain);
          controls.appendChild(document.createTextNode(' '));
          controls.appendChild(btnTime);
          ageWrap.appendChild(controls);

          const breakdownContainer = document.createElement('div');
          breakdownContainer.id = 'ageBreakContainer';
          breakdownContainer.style.marginTop = '8px';

          // ChainMaker table (start hidden)
          const chainTable = document.createElement('table');
          chainTable.id = 'ageBreakTable_chain';
          chainTable.className = 'small age-break-table';
          chainTable.style.display = 'none';
          chainTable.innerHTML = `<thead><tr><th>Jump</th><th>Duration</th><th>Age</th></tr></thead><tbody></tbody>`;
          breakdownContainer.appendChild(chainTable);

          // Time-passing table (start hidden)
          const timeTable = document.createElement('table');
          timeTable.id = 'ageBreakTable_time';
          timeTable.className = 'small age-break-table';
          timeTable.style.display = 'none';
          timeTable.innerHTML = `<thead><tr><th>Jump</th><th>Duration</th><th>Age</th></tr></thead><tbody></tbody>`;
          breakdownContainer.appendChild(timeTable);

          ageWrap.appendChild(breakdownContainer);

          // Toggle behavior: both tables hidden initially. Each button toggles its own table and hides the other.
          btnChain.addEventListener('click', () => {
            const chainHidden = chainTable.style.display === 'none' || chainTable.style.display === '';
            if (chainHidden) {
              chainTable.style.display = 'table';
              btnChain.textContent = 'Hide ChainMaker breakdown';
              // hide the other
              timeTable.style.display = 'none';
              btnTime.textContent = 'Show Time-passing breakdown';
            } else {
              chainTable.style.display = 'none';
              btnChain.textContent = 'Show ChainMaker breakdown';
            }
          });
          btnTime.addEventListener('click', () => {
            const timeHidden = timeTable.style.display === 'none' || timeTable.style.display === '';
            if (timeHidden) {
              timeTable.style.display = 'table';
              btnTime.textContent = 'Hide Time-passing breakdown';
              // hide the other
              chainTable.style.display = 'none';
              btnChain.textContent = 'Show ChainMaker breakdown';
            } else {
              timeTable.style.display = 'none';
              btnTime.textContent = 'Show Time-passing breakdown';
            }
          });

          // Re-render when supplement toggle changes
          suppToggle.addEventListener('change', () => {
            const jumperIdNow = Number(document.getElementById('jumperSelect').value);
            const { jumpTotals: jt, jumpNames: jn, jumpSupplements: js, jumpOrder: jo, altFormsByCharacterAndJump: af } = processPurchases(storedData, jumperIdNow);
            displayResults(jt, jn, js, exterminationValues, jo, af, jumperIdNow);
          });

          // Insert at top of results container
          container.insertBefore(ageWrap, container.firstChild);
        }

        // Update age table values
        const setCell = (id, v) => {
          const el = document.getElementById(id);
          if (el) el.textContent = v;
        };
        setCell('ageValue_original', ages.originalAge);

        // Derive summary ChainMaker/Time-passing ages from per-jump accumulations when possible
        // Compute includeSupplementsInTime and declare results in outer scope so they're
        // available both for summary selection and for breakdown rendering below.
        const includeSupplementsInTime = (document.getElementById('countSupplementsCB') && document.getElementById('countSupplementsCB').checked) || false;
        let chainResults = null;
        let timeResults = null;
        try {
          // Compute per-jump accumulations once and reuse the same objects for
          // both summary selection and breakdown rendering. This prevents any
          // subtle divergence caused by calling the function multiple times.
          chainResults = computePerJumpAccumulations(jumperId, storedData || {}, jumpOrder, 'chainmaker', includeSupplementsInTime);
          timeResults = computePerJumpAccumulations(jumperId, storedData || {}, jumpOrder, 'timepassing', includeSupplementsInTime);

          // IMPORTANT: determine the "last included" jump by scanning the explicit `jumpOrder`
          // in reverse. We must use `jumpOrder` (not Object.keys(results)) because the
          // breakdown rendering iterates jumps in `jumpOrder` and Object.keys() may yield
          // a different enumeration order; using jumpOrder ensures the summary uses the
          // exact same final jump as the per-jump breakdown.
          const findLastIncluded = (results) => {
            if (!Array.isArray(jumpOrder)) return null;
            for (let i = jumpOrder.length - 1; i >= 0; i--) {
              const k = String(jumpOrder[i]);
              if (results[k] && results[k].included) return results[k];
            }
            return null;
          };

          const lastChain = findLastIncluded(chainResults);
          const lastTime = findLastIncluded(timeResults);

          if (lastChain) {
            const val = lastChain.ageLongPretty || lastChain.ageLong || lastChain.ageShort || ages.chainmakerAgeFormatted || `${ages.chainmakerAge} years`;
            setCell('ageValue_chainmaker', val);
            // Attach data attribute and console debug so the browser shows which jump was used for the summary
            const chainEl = document.getElementById('ageValue_chainmaker');
            if (chainEl) {
              chainEl.setAttribute('data-summary-jump', Object.keys(chainResults).find(k => chainResults[k] === lastChain) || '');
              chainEl.setAttribute('data-summary-mode', 'chainmaker');
              if (window && window.console && window._ccDebug) console.log('[ChainCounter] summary chainmaker used jump ->', chainEl.getAttribute('data-summary-jump'), 'value ->', val);
            }
          } else {
            setCell('ageValue_chainmaker', ages.chainmakerAgeFormatted || `${ages.chainmakerAge} years`);
          }

          if (lastTime) {
            const val2 = lastTime.ageLongPretty || lastTime.ageLong || lastTime.ageShort || ages.timePassingAgeFormatted || `${ages.timePassingAge} years`;
            setCell('ageValue_timepassing', val2);
            const timeEl = document.getElementById('ageValue_timepassing');
            if (timeEl) {
              timeEl.setAttribute('data-summary-jump', Object.keys(timeResults).find(k => timeResults[k] === lastTime) || '');
              timeEl.setAttribute('data-summary-mode', 'timepassing');
              if (window && window.console && window._ccDebug) console.log('[ChainCounter] summary timepassing used jump ->', timeEl.getAttribute('data-summary-jump'), 'value ->', val2);
            }
          } else {
            setCell('ageValue_timepassing', ages.timePassingAgeFormatted || `${ages.timePassingAge} years`);
          }
        } catch (e) {
          // Fallback to original computed formatted values
          setCell('ageValue_chainmaker', ages.chainmakerAgeFormatted || `${ages.chainmakerAge} years`);
          setCell('ageValue_timepassing', ages.timePassingAgeFormatted || `${ages.timePassingAge} years`);
          // Ensure breakdown rendering has something sensible
          try {
            chainResults = computePerJumpAccumulations(jumperId, storedData || {}, jumpOrder, 'chainmaker', includeSupplementsInTime);
            timeResults = computePerJumpAccumulations(jumperId, storedData || {}, jumpOrder, 'timepassing', includeSupplementsInTime);
          } catch (e2) {
            chainResults = {};
            timeResults = {};
          }
        }

        // Add tooltips to the label cells
        updateElementWithTooltip('ageLabel_original', 'Original', 'Age when JumpChain began');
        updateElementWithTooltip('ageLabel_chainmaker', 'ChainMaker-style', '"True Age" per ChainMaker');
        updateElementWithTooltip('ageLabel_timepassing', 'Time-passing', "Companions' ages include Jumps they were not imported into, but start counting at their first import");

        // Populate both breakdown tables (chainmaker and time-passing)
          // reuse chainResults/timeResults computed above

        const chainTBody = container.querySelector('#ageBreakTable_chain tbody');
        const timeTBody = container.querySelector('#ageBreakTable_time tbody');
        if (chainTBody && timeTBody) {
          console.log('[ChainCounter] Populating age breakdown tables. jumpOrder length:', jumpOrder.length);
          chainTBody.innerHTML = '';
          timeTBody.innerHTML = '';

          // makeRow now accepts res and a mode flag to know whether this is chain or time table use
          const makeRow = (jId, name, res, mode, includeSupplementsInTime) => {
            const tr = document.createElement('tr');
            const isSupp = !!jumpSupplements[jId];
            const nameTd = document.createElement('td');
            nameTd.className = isSupp ? 'age-break-jump supplement' : 'age-break-jump';
            nameTd.textContent = name;

            // Per-jump duration (not cumulative)
            const jData = (storedData && storedData.jumps && storedData.jumps[String(jId)]) || null;
            const pjY = (jData && jData.duration && parseInt(jData.duration.years, 10)) || 0;
            const pjM = (jData && jData.duration && parseInt(jData.duration.months, 10)) || 0;
            const pjD = (jData && jData.duration && (jData.duration.days !== undefined)) ? parseFloat(jData.duration.days) || 0 : 0;
            const perJumpShort = formatShortYMD(pjY, pjM, pjD);
            const perJumpLong = formatLongYMD(pjY, pjM, pjD);
            const perJumpLongPretty = formatLongYMDPretty(pjY, pjM, pjD);

            const timeTd = document.createElement('td');
            timeTd.className = 'age-break-time';
            const ageTd = document.createElement('td');
            ageTd.className = 'age-break-age';

            if (isSupp) {
              // Supplements: always show their Duration in the Duration column
              timeTd.textContent = perJumpShort || '';
              if (perJumpLongPretty && perJumpLongPretty !== '0 days') {
                const span = document.createElement('span');
                span.className = 'tooltiptext';
                span.textContent = perJumpLongPretty;
                timeTd.classList.add('tooltip');
                timeTd.appendChild(span);
              }
              // Show age for supplements only when includeSupplementsInTime is true
              if (includeSupplementsInTime) {
                ageTd.textContent = res.ageShort || '';
                if (res.ageLongPretty && res.ageLongPretty !== '0 days') {
                  const span2 = document.createElement('span');
                  span2.className = 'tooltiptext';
                  span2.textContent = res.ageLongPretty;
                  ageTd.classList.add('tooltip');
                  ageTd.appendChild(span2);
                }
              } else {
                // Gray out the duration cell to indicate exclusion from totals
                timeTd.style.color = '#888';
                timeTd.setAttribute('data-supp-excluded', 'true');
                ageTd.textContent = '';
              }
            } else {
              // Normal jumps: Duration and accumulated Age
              timeTd.textContent = perJumpShort || '';
              if (perJumpLongPretty && perJumpLongPretty !== '0 days') {
                const span = document.createElement('span');
                span.className = 'tooltiptext';
                span.textContent = perJumpLongPretty;
                timeTd.classList.add('tooltip');
                timeTd.appendChild(span);
              }
              ageTd.textContent = res.ageShort || '';
              if (res.ageLongPretty && res.ageLongPretty !== '0 days') {
                const span2 = document.createElement('span');
                span2.className = 'tooltiptext';
                span2.textContent = res.ageLongPretty;
                ageTd.classList.add('tooltip');
                ageTd.appendChild(span2);
              }
            }

            tr.appendChild(nameTd);
            tr.appendChild(timeTd);
            tr.appendChild(ageTd);
            return tr;
          };

          for (const jId of jumpOrder) {
            const name = jumpNames[jId] || `Jump ${jId}`;
            const cres = chainResults[jId] || { cumulativeShort: '', ageShort: '' };
            const tres = timeResults[jId] || { cumulativeShort: '', ageShort: '' };
            // chain table row: pass mode 'chainmaker'
            chainTBody.appendChild(makeRow(jId, name, cres, 'chainmaker', includeSupplementsInTime));
            // time table row: pass mode 'timepassing'
            timeTBody.appendChild(makeRow(jId, name, tres, 'timepassing', includeSupplementsInTime));
          }
          // If for some reason there were no rows appended, show an explanatory placeholder
          if (chainTBody.children.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.style.fontStyle = 'italic';
            td.textContent = '(no jumps to display)';
            tr.appendChild(td);
            chainTBody.appendChild(tr);
          }
          if (timeTBody.children.length === 0) {
            const tr2 = document.createElement('tr');
            const td2 = document.createElement('td');
            td2.colSpan = 3;
            td2.style.fontStyle = 'italic';
            td2.textContent = '(no jumps to display)';
            tr2.appendChild(td2);
            timeTBody.appendChild(tr2);
          }
        }
      }
    } catch (e) {
      console.warn('Could not update structured age UI:', e);
    }
  }

  updateElementWithTooltip('totalPT', totalPT, 'Total PT');
  updateElementWithTooltip('totalItems', totalItems, 'Total Items');
  updateElementWithTooltip('totalItemsPT', totalItemsPT, 'Items PT');
  updateElementWithTooltip('totalAltForms', totalAltForms, 'Total Alt-Forms');
  updateElementWithTooltip('totalAltFormsPT', totalAltFormsPT, 'Alt-Forms PT');
  updateElementWithTooltip('totalDrawbacks', totalDrawbacks, 'Total Drawbacks');
  updateElementWithTooltip('totalDrawbacksPT', totalDrawbacksPT, 'Drawbacks PT');
  updateElementWithTooltip('totalExterminations', totalExterminations, 'Total Exterminations');
  updateElementWithTooltip('totalExterminationsPT', totalExterminationsPT, 'Exterminations PT');

  document.getElementById('resultsContainer').style.display = 'block';
  document.getElementById('rewardScenarios').style.display = 'block';

  // Re-add extermination input listeners after updating the table
  addExterminationInputListeners(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder);

  return resultsArray;
}

function populateDropdowns() {
  const dropdownOptions = [...Array(10).keys()].map(i => `<option value="${i + 1}">${i + 1}</option>`).join('');

  document.getElementById('drawbackTakerPT').innerHTML = dropdownOptions;
  document.getElementById('drawbackTakerCount').innerHTML = dropdownOptions;
  document.getElementById('thousandFacesPT').innerHTML = dropdownOptions;
  document.getElementById('thousandFacesCount').innerHTML = dropdownOptions;
  document.getElementById('exterminatorsPT').innerHTML = dropdownOptions;
  document.getElementById('exterminatorsCount').innerHTML = dropdownOptions;
  document.getElementById('packRatPT').innerHTML = dropdownOptions;
  document.getElementById('packRatCount').innerHTML = dropdownOptions;

  // Set default values
  document.getElementById('drawbackTakerPT').value = 1;
  document.getElementById('drawbackTakerCount').value = 10;
  document.getElementById('thousandFacesPT').value = 1;
  document.getElementById('thousandFacesCount').value = 2;
  document.getElementById('exterminatorsPT').value = 2;
  document.getElementById('exterminatorsCount').value = 4;
  document.getElementById('packRatPT').value = 2;
  document.getElementById('packRatCount').value = 5;
}

/**
 * Compute ages for a character (jumper or companion) using the chain data.
 * Returns an object containing:
 *  - originalAge: number
 *  - chainmakerAge: age computed like ChainMaker (counts only jumps the character is imported into)
 *  - timePassingAge: age computed by starting at the character's first import and counting every jump from that point forward
 *  - details: which jumps were counted for each calculation (arrays of jump ids)
 *
 * Rules implemented:
 *  - Use character.originalAge as the starting point (parsed as integer).
 *  - Jumps are iterated in the order given by data.jumpList (falling back to Object.keys(data.jumps)).
 *  - A jump is considered a supplement if it has a parentJump property.
 *  - For main jumper (characterId === 0) the "jumper" True Age is originalAge + sum(years) of jumps the jumper took, excluding supplements.
 *  - For companions, chainmakerAge = originalAge + sum(years) of jumps where the companion appears (i.e. imported into).
 *  - For companions, timePassingAge: find the first jump the companion is imported into. If that first import is in a supplement, the start jump is the supplement's parentJump.
 *    Then sum the years for every jump from that start jump (inclusive) through the end of the ordered jump list.
 */
function getCharacterAges(characterId, data) {
  const chars = data.characters || {};
  const jumps = data.jumps || {};

  // Parse original age
  const originalAgeRaw = (chars[characterId] && chars[characterId].originalAge) || chars[characterId]?.age || 0;
  const originalAge = parseInt(originalAgeRaw, 10) || 0;

  // Build ordered jump list (strings or numbers as stored in data)
  const jumpOrder = Array.isArray(data.jumpList) && data.jumpList.length > 0
    ? data.jumpList.map(String)
    : Object.keys(jumps);

  const isSupplement = (jumpId) => {
    const j = jumps[jumpId];
    return j && Object.prototype.hasOwnProperty.call(j, 'parentJump') && j.parentJump !== undefined && j.parentJump !== null;
  };

  const durationYears = (jumpId) => {
    const j = jumps[jumpId];
    return (j && j.duration && parseInt(j.duration.years, 10)) || 0;
  };

  // Helper: does this jump include the character (imported into this jump)?
  const isImportedIntoJump = (jumpId) => {
    const j = jumps[jumpId];
    if (!j) return false;
    // j.characters is usually an array of character ids present in that jump
    if (Array.isArray(j.characters)) {
      return j.characters.map(String).includes(String(characterId));
    }
    return false;
  };

  // ChainMaker-style age: count only jumps the character is imported into.
  // For the main jumper (id 0) we exclude supplements from the count, per your description.
  const countedChainmakerJumps = [];
  let chainmakerYears = 0;
  let chainmakerMonths = 0;
  let chainmakerDays = 0;
  for (const jId of jumpOrder) {
    if (Number(characterId) === 0) {
      // Main jumper: count every jump (including supplements)
      const j = jumps[jId];
  const yrs = (j && j.duration && parseInt(j.duration.years, 10)) || 0;
  const mons = (j && j.duration && parseInt(j.duration.months, 10)) || 0;
  const dys = (j && j.duration && (j.duration.days !== undefined)) ? parseFloat(j.duration.days) || 0 : 0;
      if (yrs) chainmakerYears += yrs;
      if (mons) chainmakerMonths += mons;
      if (dys) chainmakerDays += dys;
      countedChainmakerJumps.push(jId);
    } else {
      // Companion/other: count only jumps they're imported into
      if (!isImportedIntoJump(jId)) continue;
      const j = jumps[jId];
      const yrs = (j && j.duration && parseInt(j.duration.years, 10)) || 0;
      const mons = (j && j.duration && parseInt(j.duration.months, 10)) || 0;
      const dys = (j && j.duration && parseInt(j.duration.days, 10)) || 0;
      if (yrs) chainmakerYears += yrs;
      if (mons) chainmakerMonths += mons;
      if (dys) chainmakerDays += dys;
      countedChainmakerJumps.push(jId);
    }
  }

  // Normalize chainmaker months/days -> years/months/days
  // 30 days = 1 month, 12 months = 1 year (carry)
  let carryMonthsFromDays = Math.floor(chainmakerDays / 30);
  chainmakerMonths += carryMonthsFromDays;
  chainmakerDays = chainmakerDays % 30;
  let carryYearsFromMonths = Math.floor(chainmakerMonths / 12);
  chainmakerYears += carryYearsFromMonths;
  chainmakerMonths = chainmakerMonths % 12;

  const chainmakerAge = originalAge + chainmakerYears;

  const cNorm = normalizeYMD(chainmakerAge, chainmakerMonths, chainmakerDays);
  const chainmakerAgeFormatted = formatLongYMD(cNorm.yrs, cNorm.mons, cNorm.dys);

  // Time-passing age for companions: start counting from first import (or parent jump if first import is a supplement), then count every jump from that point forward
  let timePassingAge = originalAge;
  const countedTimePassingJumps = [];

  // Find first import
  const firstImportIndex = jumpOrder.findIndex(jId => isImportedIntoJump(jId));
  if (firstImportIndex !== -1) {
    let startJumpId = jumpOrder[firstImportIndex];
    // If first import is a supplement, use its parentJump (stringify to match keys)
    if (isSupplement(startJumpId)) {
      const parent = jumps[startJumpId].parentJump;
      if (parent !== undefined && parent !== null) {
        startJumpId = String(parent);
      }
    }

    // Find index for startJumpId (it should exist in jumpOrder, but if not, fall back to firstImportIndex)
    let startIndex = jumpOrder.indexOf(String(startJumpId));
    if (startIndex === -1) startIndex = firstImportIndex;

    // Sum all jump durations from startIndex to end (years/months/days)
    let tpYears = 0;
    let tpMonths = 0;
    let tpDays = 0;
    for (let i = startIndex; i < jumpOrder.length; i++) {
      const jId = jumpOrder[i];
      const j = jumps[jId];
      const yrs = (j && j.duration && parseInt(j.duration.years, 10)) || 0;
      const mons = (j && j.duration && parseInt(j.duration.months, 10)) || 0;
      const dys = (j && j.duration && (j.duration.days !== undefined)) ? parseFloat(j.duration.days) || 0 : 0;
      if (yrs) tpYears += yrs;
      if (mons) tpMonths += mons;
      if (dys) tpDays += dys;
      if ((yrs || mons || dys)) countedTimePassingJumps.push(jId);
    }

    // Normalize timePassing months/days -> years/months/days
    let carryMonthsFromDaysTP = Math.floor(tpDays / 30);
    tpMonths += carryMonthsFromDaysTP;
    tpDays = tpDays % 30;
    let carryYearsFromMonthsTP = Math.floor(tpMonths / 12);
    tpYears += carryYearsFromMonthsTP;
    tpMonths = tpMonths % 12;

    // Normalize and format
    const tpNorm = normalizeYMD(tpYears, tpMonths, tpDays);
    timePassingAge = originalAge + tpNorm.yrs;
    var timePassingAgeFormatted = formatLongYMD(timePassingAge, tpNorm.mons, tpNorm.dys);
  }

  return {
    originalAge,
    chainmakerAge,
    chainmakerAgeFormatted,
    timePassingAge,
    timePassingAgeFormatted,
    details: {
      countedChainmakerJumps,
      countedTimePassingJumps
    }
  };
}

function addDropdownEventListeners(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder) {
  const dropdowns = [
    'drawbackTakerPT',
    'drawbackTakerCount',
    'thousandFacesPT',
    'thousandFacesCount',
    'exterminatorsPT',
    'exterminatorsCount',
    'packRatPT',
    'packRatCount'
  ];

  dropdowns.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      // Only update table if data is loaded and table has been generated at least once
      if (storedData && storedResults !== null) {
        const jumperId = Number(document.getElementById('jumperSelect').value); // <-- get current jumperId
        const { jumpTotals, jumpNames, jumpSupplements, jumpOrder, altFormsByCharacterAndJump } = processPurchases(storedData, jumperId);
        //const exterminationValues = {}; // Optionally, persist these if you want to keep user edits
        storedResults = displayResults(
          jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder, altFormsByCharacterAndJump, jumperId
        );
      }
    });
  });
}

function addExterminationInputListeners(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder) {
  const inputs = document.querySelectorAll('.exterminations-input');

  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const jumpId = input.getAttribute('data-jump-id');
      exterminationValues[jumpId] = parseInt(input.value, 10) || 0;
      const jumperId = Number(document.getElementById('jumperSelect').value); // <-- get current jumperId
      displayResults(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder, altFormsByCharacterAndJump, jumperId);
    });
  });
}

function updateElementWithTooltip(id, value, tooltipText) {
  const element = document.getElementById(id);
  element.innerHTML = value;
  element.classList.add('tooltip');
  
  const span = document.createElement('span');
  span.className = 'tooltiptext';
  span.textContent = tooltipText;
  
  element.appendChild(span);
  
  if (id.endsWith('PT')) {
    element.classList.add('PTcount');
  }
}

function populateJumperDropdown(data) {
  const jumperSelect = document.getElementById('jumperSelect');
  jumperSelect.innerHTML = ''; // Clear previous options

  // Find all unique jumper IDs and names
  const jumperMap = {};
  if (data.characters) {
    for (const [id, char] of Object.entries(data.characters)) {
      jumperMap[id] = char.name || `Jumper ${id}`;
    }
  } else if (data.purchases) {
    // Fallback: find IDs from purchases if no characters section
    for (const purchase of Object.values(data.purchases)) {
      const id = purchase._characterId;
      if (!(id in jumperMap)) {
        jumperMap[id] = `Jumper ${id}`;
      }
    }
  } else {
    jumperMap[0] = 'Jumper 0';
  }

  // Add options to dropdown
  for (const [id, name] of Object.entries(jumperMap)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    jumperSelect.appendChild(option);
  }
}

// Export for Node tests if running under CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports.getCharacterAges = getCharacterAges;
  // Export computePerJumpAccumulations so tests can verify per-jump accumulations and final-included logic
  module.exports.computePerJumpAccumulations = computePerJumpAccumulations;
}