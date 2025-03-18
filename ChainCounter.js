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
      const data = JSON.parse(event.target.result);
      populateDropdowns(); // Ensure dropdowns are populated before calling displayResults
      const { jumpTotals, jumpNames, jumpSupplements, jumpOrder, altFormsByCharacterAndJump } = processPurchases(data);
      const exterminationValues = {}; // Store Extermination input values
      const resultsArray = displayResults(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder, altFormsByCharacterAndJump);
      //console.log(resultsArray); // You can use this array for further processing

      // Add event listeners to dropdowns to recalculate the table on change
      addDropdownEventListeners(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder);
      addExterminationInputListeners(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder);
    } catch (error) {
      alert('Error parsing JSON file: ' + error.message);
    }
  };
  reader.readAsText(file);
});

function processPurchases(data) {
  const typeMappings = { 1: 'Items', 2: 'AltForms', 3: 'Drawbacks' };
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
      if (purchase._characterId === 0) { // Ensure only main jumper's purchases are counted
        const jumpId = purchase._jumpId;
        const itemType = purchase._type;

        if (!jumpTotals[jumpId]) {
          jumpTotals[jumpId] = { Items: 0, AltForms: 0, Drawbacks: 0, Exterminations: 0 };
        }

        if (typeMappings[itemType]) {
          jumpTotals[jumpId][typeMappings[itemType]] += 1;
        }
      }
    }
  }

  // Log all alt-forms separated by characterId and jumpId
  if (data.altforms) {
    console.log("Alt-Forms Data:", data.altforms);
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

      console.log(`Logging Alt-Form ${altForm._id} named ${altForm.name} for Character ${characterId} and Jump ${jumpId}`);
    }
  }

  const jumpOrder = data.jumpList || Object.keys(jumpNames); // Use jumpList if available, else fallback

  return { jumpTotals, jumpNames, jumpSupplements, jumpOrder, altFormsByCharacterAndJump };
}

function displayResults(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder, altFormsByCharacterAndJump) {
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
    totalAltForms += totals.AltForms;
    totalDrawbacks += totals.Drawbacks;
    totalExterminations += exterminationValues[jumpId] || totals.Exterminations;

    console.log(`Jump ID: ${jumpId}`, {
      jumpName,
      totals,
      totalItems,
      totalAltForms,
      totalDrawbacks,
      totalExterminations
    });

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
      totals.AltForms,
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
      displayResults(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder);
    });
  });
}

function addExterminationInputListeners(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder) {
  const inputs = document.querySelectorAll('.exterminations-input');

  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const jumpId = input.getAttribute('data-jump-id');
      exterminationValues[jumpId] = parseInt(input.value, 10) || 0;
      displayResults(jumpTotals, jumpNames, jumpSupplements, exterminationValues, jumpOrder);
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