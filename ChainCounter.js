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
          const collapseBtn = document.createElement('button');
          collapseBtn.type = 'button';
          collapseBtn.id = 'ageBreakToggle';
          collapseBtn.textContent = 'Show per-jump breakdown';
          collapseBtn.style.marginTop = '6px';
          ageWrap.appendChild(collapseBtn);

          const breakdownDiv = document.createElement('div');
          breakdownDiv.id = 'ageBreakdown';
          breakdownDiv.style.display = 'none';
          breakdownDiv.style.marginTop = '8px';
          breakdownDiv.innerHTML = `
            <table class="small" id="ageBreakTable">
              <thead><tr><th>Jump</th><th>ChainMaker yrs</th><th>TimePass yrs</th></tr></thead>
              <tbody></tbody>
            </table>
          `;
          ageWrap.appendChild(breakdownDiv);

          collapseBtn.addEventListener('click', () => {
            const showing = breakdownDiv.style.display === 'block';
            breakdownDiv.style.display = showing ? 'none' : 'block';
            collapseBtn.textContent = showing ? 'Show per-jump breakdown' : 'Hide per-jump breakdown';
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
        setCell('ageValue_chainmaker', ages.chainmakerAge);
        setCell('ageValue_timepassing', ages.timePassingAge);

        // Add tooltips to the label cells
        updateElementWithTooltip('ageLabel_original', 'Original', 'Age when JumpChain began');
        updateElementWithTooltip('ageLabel_chainmaker', 'ChainMaker-style', '"True Age" per ChainMaker');
        updateElementWithTooltip('ageLabel_timepassing', 'Time-passing', "Companions' ages include Jumps they were not imported into, but start counting at their first import");

        // Populate breakdown table
        const tbody = container.querySelector('#ageBreakTable tbody');
        if (tbody) {
          tbody.innerHTML = '';
          const chainmakerSet = new Set(ages.details.countedChainmakerJumps.map(String));
          const timePassSet = new Set(ages.details.countedTimePassingJumps.map(String));

          // local helper to get duration years for a jump id (string or number)
          const getJumpYears = (jid) => {
            const jd = (storedData && storedData.jumps && storedData.jumps[String(jid)]) || null;
            return (jd && jd.duration && parseInt(jd.duration.years, 10)) || 0;
          };

          for (const jId of jumpOrder) {
            const row = document.createElement('tr');
            const name = jumpNames[jId] || `Jump ${jId}`;
            const isSupp = !!jumpSupplements[jId];
            let cm = chainmakerSet.has(String(jId)) ? getJumpYears(jId) : '';
            let tp = timePassSet.has(String(jId)) ? getJumpYears(jId) : '';
            // If value is 0, display nothing
            if (cm === 0) cm = '';
            if (tp === 0) tp = '';

            // Left-align jump names normally; right-align supplements (to match main table behavior)
            const nameCellClass = isSupp ? 'age-break-jump supplement' : 'age-break-jump';
            row.innerHTML = `<td class="${nameCellClass}">${name}</td><td class="age-break-cm">${cm}</td><td class="age-break-tp">${tp}</td>`;
            tbody.appendChild(row);
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
  for (const jId of jumpOrder) {
    if (Number(characterId) === 0) {
      // Main jumper: count every jump (including supplements)
      const yrs = durationYears(jId);
      if (yrs) chainmakerYears += yrs;
      countedChainmakerJumps.push(jId);
    } else {
      // Companion/other: count only jumps they're imported into
      if (!isImportedIntoJump(jId)) continue;
      const yrs = durationYears(jId);
      if (yrs) chainmakerYears += yrs;
      countedChainmakerJumps.push(jId);
    }
  }

  const chainmakerAge = originalAge + chainmakerYears;

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

    // Sum all jump durations from startIndex to end
    let yearsSum = 0;
    for (let i = startIndex; i < jumpOrder.length; i++) {
      const jId = jumpOrder[i];
      const yrs = durationYears(jId);
      if (yrs) {
        yearsSum += yrs;
        countedTimePassingJumps.push(jId);
      }
    }
    timePassingAge = originalAge + yearsSum;
  }

  return {
    originalAge,
    chainmakerAge,
    timePassingAge,
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
}