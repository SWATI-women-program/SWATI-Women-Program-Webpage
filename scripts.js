/* ==========================================================================
   INSTITUTIONAL CORE SYSTEM ENGINE (MODULAR RUNTIME)
   ========================================================================== */

const DEPLOYMENT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbypV-SgefCuYdIwGlMDXxpFYA8qXGE3nX2dTFoHukhxeW7w64q3rD5uFmXPzOjQCa6J/exec"; 

const SYSTEM_SCHEMA = {
  MASTER_USERS: ["UID", "Name", "Password", "Role", "RecordID"],
  MASTER_COURSES: ["CourseCode", "CourseName", "Department", "RecordID"],
  MASTER_CLASSES: ["ClassID", "ClassName", "CourseCode", "Department", "RecordID"],
  MASTER_SUBJECTS: ["SubjectCode", "SubjectName", "CourseCode", "Department", "RecordID"],
  MASTER_STAFFS: ["StaffID", "StaffName", "Department", "Contact", "RecordID"],
  MASTER_ALLOCATIONS: ["StaffID", "ClassID", "SubjectCode", "RecordID"],
  MASTER_STUDENTS: ["StudentID", "StudentName", "ClassID", "CourseCode", "Status", "DOB", "Age", "PrimaryContact", "SecondaryContact", "Std10th", "Std12th", "Accommodation", "HostelName", "RoomNo", "Address", "PhotoURL", "RecordID"],
  CLASS_TIMETABLES: ["ClassID", "Day", "Hour_1", "Hour_2", "Hour_3", "Hour_4", "Hour_5", "Hour_6", "Hour_7", "RecordID"], 
  DAILY_ATTENDANCE: ["Date", "SubjectCode", "ClassID", "StudentID", "Status", "MarkedBy", "RecordID"],
  STUDENT_MARKS: ["StudentID", "SubjectCode", "CIA1", "CIA2", "CIA3", "Assignment", "Attendance", "Semester", "Total", "RecordID"]
};

let activeUserSession = { role: "", uid: "", name: "" };
let syncInProgressState = false;
let editingRowIndices = {
  MASTER_USERS: -1, MASTER_COURSES: -1, MASTER_CLASSES: -1, MASTER_SUBJECTS: -1,
  MASTER_STAFFS: -1, MASTER_ALLOCATIONS: -1, MASTER_STUDENTS: -1, CLASS_TIMETABLES: -1,
  DAILY_ATTENDANCE: -1, STUDENT_MARKS: -1
};

// Global handles for instance memory recycling management
let overallPieChartInstance = null;
let subjectPieChartInstance = null;

// Fix image links or Base64 format systematically
function fixBase64Image(base64String) {
  if (!base64String) return ''; 
  let cleanString = base64String.replace(/ /g, '+');
  if (cleanString.startsWith('data:image') && cleanString.includes(',')) {
    return cleanString;
  }
  if (cleanString.startsWith('dataimage')) {
    cleanString = cleanString.replace('dataimage', 'data:image');
  }
  if (!cleanString.startsWith('data:image') && (cleanString.startsWith('jpeg') || cleanString.startsWith('png') || cleanString.startsWith('gif') || cleanString.startsWith('webp'))) {
    return `data:image/${cleanString}`;
  }
  if (!cleanString.startsWith('data:image') && !cleanString.startsWith('http')) {
    return `data:image/jpeg;base64,${cleanString}`;
  }
  return cleanString;
}

window.addEventListener("DOMContentLoaded", async () => {
  initializeLocalDatabases();
  generateTimetableSlotsUI();
  setupGlobalEvents();
  autoLoginIfSessionExists();
  
  const datePicker = document.getElementById("att-date-picker");
  if (datePicker && !datePicker.value) {
    datePicker.value = new Date().toISOString().split('T')[0];
  }

  console.log("System Initializing: Fetching data from Google Sheets...");
  if (!syncInProgressState) {
    setGlobalSyncState(true);
    fetch(`${DEPLOYMENT_WEB_APP_URL}?action=fetchAll`)
      .then(res => res.json())
      .then(networkData => {
        if (networkData.status === "error") {
          console.warn("Auto-Pull Background Engine Error: " + networkData.message);
          return;
        }
        Object.keys(SYSTEM_SCHEMA).forEach(key => {
          let backendSheetName = sheetTabForKey(key);
          if (backendSheetName && networkData[backendSheetName]) {
            localStorage.setItem(key, JSON.stringify(networkData[backendSheetName]));
          }
        });
        renderAllTables();
        refreshFormDropdownLists();
        if(activeUserSession.role === "STUDENT") {
          renderStudentSelfProfileViewer();
        } else if (activeUserSession.role === "STAFF") {
          renderStaffDashboardConsole();
        }
        console.log("System database successfully auto-synchronized on page startup!");
      })
      .catch(err => {
        console.error("Connection failure with backend server during auto-sync:", err);
      })
      .finally(() => setGlobalSyncState(false));
  }
});

function initializeLocalDatabases() {
  Object.keys(SYSTEM_SCHEMA).forEach(key => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify([]));
    }
  });
}

function generateTimetableSlotsUI() {
  const container = document.getElementById("timetable-slots-dynamic-container");
  if (!container) return;
  container.innerHTML = "";
  for(let h=1; h<=7; h++) {
    container.insertAdjacentHTML('beforeend', `
      <div style="background: var(--slate-50); padding: 20px; border-radius: 12px; border: 1px solid var(--slate-200);">
        <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--slate-800); font-weight: 700;">Hour Allocation ${h} Slot</h4>
        <div class="form-grid-layout" style="grid-template-columns: repeat(4, 1fr); gap: 15px;">
          <div class="form-field-group"><label>Subject Mapped</label><select id="tt-sub-h${h}"></select></div>
          <div class="form-field-group"><label>Primary Instructor</label><select id="tt-staff1-h${h}"></select></div>
          <div class="form-field-group"><label>Co-Staff A</label><select id="tt-staff2-h${h}"></select></div>
          <div class="form-field-group"><label>Co-Staff B</label><select id="tt-staff3-h${h}"></select></div>
        </div>
      </div>
    `);
  }
}

function setupGlobalEvents() {
  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      menuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      const targetSectionId = item.getAttribute("data-target");
      const sections = document.querySelectorAll(".tab-content");
      sections.forEach(s => s.classList.remove("active"));
      
      const targetSec = document.getElementById(targetSectionId);
      if(targetSec) targetSec.classList.add("active");

      if(targetSectionId === "student-profile-section" && activeUserSession.role === "STUDENT") {
        renderStudentSelfProfileViewer();
      }

      if(targetSectionId === "timetable-creator-section") {
        const configureBlock = document.getElementById("tt-configure-block");
        const matrixBlock = document.getElementById("tt-matrix-block");
        if(configureBlock) configureBlock.style.display = "none";
        if(matrixBlock) matrixBlock.style.display = "none";
      }
    });
  });

  const ttClassSelect = document.getElementById("tt-class-select");
  if(ttClassSelect) {
    ttClassSelect.addEventListener("change", renderTimetableGridDisplay);
  }
}

function autoLoginIfSessionExists() {
  const cachedUser = localStorage.getItem("ACTIVE_SESSION_CACHE");
  if (cachedUser) {
    const parsed = JSON.parse(cachedUser);
    activeUserSession = parsed;
    applyAuthorizationRules(parsed.role, parsed.name);
  }
}

function calculateStudentAgeRuntime() {
  const dobValue = document.getElementById("std-dob").value;
  const ageInput = document.getElementById("std-age");
  if(!dobValue || !ageInput) return;
  
  const birthDate = new Date(dobValue);
  const today = new Date();
  let calculatedAge = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    calculatedAge--;
  }
  ageInput.value = calculatedAge >= 0 ? calculatedAge : 0;
}

function toggleHostelFieldsVisibility() {
  const accommodationType = document.getElementById("std-accom").value;
  const hostelFields = document.querySelectorAll(".hostel-conditional-field");
  hostelFields.forEach(field => {
    if(accommodationType === "Hostel") {
      field.style.display = "flex";
    } else {
      field.style.display = "none";
      const innerInput = field.querySelector("input");
      if(innerInput) innerInput.value = ""; 
    }
  });
}

function handlePhotoUpload(inputNode) {
  const file = inputNode.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64String = e.target.result;
    document.getElementById("std-photo-hidden").value = base64String;
    const previewBox = document.getElementById("photo-preview-box");
    previewBox.innerHTML = `<img src="${base64String}" style="width:100%; height:100%; object-fit:cover;">`;
    previewBox.style.display = "flex";
  };
  reader.readAsDataURL(file);
}

function toggleTimetablePlannerMode(workspaceMode) {
  const configPanel = document.getElementById("tt-configure-block");
  const matrixPanel = document.getElementById("tt-matrix-block");
  if(!configPanel || !matrixPanel) return;

  if (workspaceMode === "create") {
    configPanel.style.display = "block";
    matrixPanel.style.display = "none";
  } else if (workspaceMode === "existing") {
    configPanel.style.display = "none";
    matrixPanel.style.display = "block";
    renderTimetableGridDisplay();
  }
}

function setGlobalSyncState(status) {
  syncInProgressState = status;
  const syncBtn = document.getElementById("cloud-sync-btn");
  if (syncBtn) {
    if (status) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
    } else {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Pull & Sync';
    }
  }
}

function syncAllFromGoogleSheets() {
  if (syncInProgressState) return;
  setGlobalSyncState(true);

  fetch(`${DEPLOYMENT_WEB_APP_URL}?action=fetchAll`)
    .then(res => res.json())
    .then(networkData => {
      if (networkData.status === "error") {
        alert("Pull Engine Error: " + networkData.message);
        return;
      }
      Object.keys(SYSTEM_SCHEMA).forEach(key => {
        let backendSheetName = sheetTabForKey(key);
        if (backendSheetName && networkData[backendSheetName]) {
          localStorage.setItem(key, JSON.stringify(networkData[backendSheetName]));
        }
      });
      renderAllTables();
      refreshFormDropdownLists();
      if(activeUserSession.role === "STUDENT") {
        renderStudentSelfProfileViewer();
      } else if (activeUserSession.role === "STAFF") {
        renderStaffDashboardConsole();
      }
      alert("System database successfully synchronized and refreshed!");
    })
    .catch(err => {
      console.error(err);
      alert("Connection failure with backend server. Check configurations.");
    })
    .finally(() => setGlobalSyncState(false));
}

async function syncWithGoogleSheet(sheetTab, payload, headers, action, recordId = "") {
  if (!DEPLOYMENT_WEB_APP_URL) return;
  
  const requestBody = {
    tabName: sheetTab, action: action, payload: payload, headers: headers, rowId: recordId          
  };

  try {
    let res = await fetch(DEPLOYMENT_WEB_APP_URL, {
      method: "POST",
      mode: "cors",            
      headers: { "Content-Type": "text/plain;charset=utf-8" }, 
      body: JSON.stringify(requestBody)
    });
    let resData = await res.json();
    console.log("Cloud Engine Operations Response:", resData);
  } catch (err) {
    console.warn("Google sheet database synchronization logger exception:", err);
  }
}

function renderAdminDashboardSummary() {
  const staff = JSON.parse(localStorage.getItem("MASTER_STAFFS")) || [];
  const students = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  let dayscholarCount = 0, hostelerCount = 0;
  
  students.forEach(student => {
    let accommodation = student[11] ? String(student[11]).trim().toLowerCase() : "";
    if (accommodation === "dayscholar") dayscholarCount++;
    else if (accommodation === "hostel") hostelerCount++;
  });

  const staffEl = document.getElementById("dash-count-staff");
  const studentsEl = document.getElementById("dash-count-students");
  const dayscholarEl = document.getElementById("dash-count-dayscholar");
  const hostelerEl = document.getElementById("dash-count-hosteler");

  if (staffEl) staffEl.innerText = staff.length;
  if (studentsEl) studentsEl.innerText = students.length;
  if (dayscholarEl) dayscholarEl.innerText = dayscholarCount;
  if (hostelerEl) hostelerEl.innerText = hostelerCount;
}

function sheetTabForKey(key) {
  const map = {
    MASTER_USERS: "Master_Users", MASTER_COURSES: "Master_Courses", MASTER_CLASSES: "Master_Classes",
    MASTER_SUBJECTS: "Master_Subjects", MASTER_STAFFS: "Master_Staffs", MASTER_ALLOCATIONS: "Master_Allocations", 
    MASTER_STUDENTS: "Master_Students", CLASS_TIMETABLES: "Class_Timetables", DAILY_ATTENDANCE: "Daily_Class_Attendance",
    STUDENT_MARKS: "Student_Marks"
  };
  return map[key] || "";
}

function handleSystemLogin() {
  const uid = document.getElementById("login-uid").value.trim();
  const pass = document.getElementById("login-pass").value.trim();
  const errorMsg = document.getElementById("login-error");

  if (!uid || !pass) {
    errorMsg.innerText = "Please provide valid credentials!";
    errorMsg.style.display = "block";
    return;
  }

  errorMsg.style.display = "none";
  const users = JSON.parse(localStorage.getItem("MASTER_USERS")) || [];
  let userRecord = users.find(u => u[0] == uid && u[2] == pass);

  if (userRecord) {
    activeUserSession = { role: userRecord[3], uid: userRecord[0], name: userRecord[1] };
    localStorage.setItem("ACTIVE_SESSION_CACHE", JSON.stringify(activeUserSession));
    applyAuthorizationRules(userRecord[3], userRecord[1]);
  } else if (uid === "admin" && pass === "admin") {
    activeUserSession = { role: "ADMIN", uid: "admin", name: "System Administrator" };
    localStorage.setItem("ACTIVE_SESSION_CACHE", JSON.stringify(activeUserSession));
    applyAuthorizationRules("ADMIN", "System Administrator");
  } else {
    errorMsg.innerText = "Authentication Failed: Invalid user credentials.";
    errorMsg.style.display = "block";
  }
}

function applyAuthorizationRules(role, name) {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("global-header").style.display = "block";
  document.getElementById("main-sidebar").style.display = "flex";
  document.getElementById("main-content-area").style.display = "block";

  document.getElementById("user-display-tag").innerText = name;
  document.getElementById("role-display-tag").innerText = role;

  const adminMenuOpts = document.querySelectorAll(".admin-only-opt");
  const staffMenuOpts = document.querySelectorAll(".staff-only-opt");

  if (role === "ADMIN") {
    adminMenuOpts.forEach(el => el.style.display = "flex");
    staffMenuOpts.forEach(el => el.style.display = "none"); 
    document.getElementById("student-menu-profile").style.display = "none";
    document.getElementById("mode-flag-badge").innerText = "ADMIN PORTAL";
    triggerNavigationTabChange("dashboard-section");
  } else if (role === "STAFF") {
    adminMenuOpts.forEach(el => el.style.display = "none");
    staffMenuOpts.forEach(el => el.style.display = "flex"); 
    document.getElementById("student-menu-profile").style.display = "none";
    document.getElementById("mode-flag-badge").innerText = "FACULTY PORTAL";
    renderStaffDashboardConsole();
    triggerNavigationTabChange("staff-dashboard-section");
  } else if (role === "STUDENT") {
    adminMenuOpts.forEach(el => el.style.display = "none");
    staffMenuOpts.forEach(el => el.style.display = "none");
    document.getElementById("student-menu-profile").style.display = "flex";
    document.getElementById("mode-flag-badge").innerText = "STUDENT PORTAL";
    triggerNavigationTabChange("student-profile-section");
    renderStudentSelfProfileViewer();
  }

  renderAllTables();
  refreshFormDropdownLists();
}

function triggerNavigationTabChange(tabId) {
  const menuItems = document.querySelectorAll(".menu-item");
  menuItems.forEach(item => {
    if (item.getAttribute("data-target") === tabId) item.classList.add("active");
    else item.classList.remove("active");
  });
  const sections = document.querySelectorAll(".tab-content");
  sections.forEach(s => {
    if (s.id === tabId) s.classList.add("active");
    else s.classList.remove("active");
  });
}

function handleLogout() {
  activeUserSession = { role: "", uid: "", name: "" };
  localStorage.removeItem("ACTIVE_SESSION_CACHE");
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("global-header").style.display = "none";
  document.getElementById("main-sidebar").style.display = "none";
  document.getElementById("main-content-area").style.display = "none";
}

function refreshFormDropdownLists() {
  const courseList = JSON.parse(localStorage.getItem("MASTER_COURSES")) || [];
  const classList = JSON.parse(localStorage.getItem("MASTER_CLASSES")) || [];
  const subjectList = JSON.parse(localStorage.getItem("MASTER_SUBJECTS")) || [];
  const staffList = JSON.parse(localStorage.getItem("MASTER_STAFFS")) || [];

  populateSelectControl("cls-course-select", courseList, 0, 1);
  populateSelectControl("sub-course-select", courseList, 0, 1);
  populateSelectControl("std-course-select", courseList, 0, 1);
  populateSelectControl("std-class-select", classList, 0, 1);
  populateSelectControl("tt-class-select", classList, 0, 1);
  populateSelectControl("att-class-select", classList, 0, 1);
  populateSelectControl("marks-class-select", classList, 0, 1);
  populateSelectControl("modal-tt-class-select", classList, 0, 1);

  populateSelectControl("alloc-staff-select", staffList, 1, 0); 
  populateSelectControl("alloc-class-select", classList, 0, 1);
  populateSelectControl("alloc-sub-select", subjectList, 0, 1);

  for (let hourIdx = 1; hourIdx <= 7; hourIdx++) {
    populateSelectControl(`tt-sub-h${hourIdx}`, subjectList, 0, 1, "FREE PERIOD");
    populateSelectControl(`tt-staff1-h${hourIdx}`, staffList, 1, 0, "PRIMARY STAFF");
    populateSelectControl(`tt-staff2-h${hourIdx}`, staffList, 1, 0, "CO-STAFF A (OPTIONAL)");
    populateSelectControl(`tt-staff3-h${hourIdx}`, staffList, 1, 0, "CO-STAFF B (OPTIONAL)");
  }
}

function populateSelectControl(elementId, dataset, valueColIndex, textColIndex, defaultAlternativeText = null) {
  const selectNode = document.getElementById(elementId);
  if (!selectNode) return;
  selectNode.innerHTML = "";

  let opt = document.createElement("option");
  opt.value = "";
  opt.text = defaultAlternativeText ? defaultAlternativeText : `-- Select Option --`;
  selectNode.appendChild(opt);

  dataset.forEach(row => {
    let opt = document.createElement("option");
    opt.value = row[valueColIndex];
    opt.text = `${row[valueColIndex]} - ${row[textColIndex]}`;
    selectNode.appendChild(opt);
  });
}

function handleFormSubmission(tblKey, inputControlIds, resetFormElementId = null) {
  let valuesMatrix = JSON.parse(localStorage.getItem(tblKey)) || [];
  let formValues = inputControlIds.map(id => {
    let node = document.getElementById(id);
    return node ? node.value.trim() : "";
  });

  if (tblKey === "MASTER_STUDENTS" && document.getElementById("std-accom").value === "Dayscholar") {
    formValues[12] = ""; formValues[13] = ""; 
  }

  let activeIndex = editingRowIndices[tblKey];
  let recordId = "";

  if (activeIndex > -1) {
    let targetRowData = valuesMatrix[activeIndex];
    recordId = targetRowData[targetRowData.length - 1]; 
    formValues.push(recordId);
    valuesMatrix[activeIndex] = formValues;
    editingRowIndices[tblKey] = -1;

    let targetTab = sheetTabForKey(tblKey);
    if (targetTab) syncWithGoogleSheet(targetTab, formValues, SYSTEM_SCHEMA[tblKey], "UPDATE", recordId);
  } else {
    recordId = "REC-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    formValues.push(recordId);
    valuesMatrix.push(formValues);

    let targetTab = sheetTabForKey(tblKey);
    if (targetTab) syncWithGoogleSheet(targetTab, formValues, SYSTEM_SCHEMA[tblKey], "CREATE");
  }

  localStorage.setItem(tblKey, JSON.stringify(valuesMatrix));
  renderAllTables();
  refreshFormDropdownLists();

  if (resetFormElementId) {
    document.getElementById(resetFormElementId).reset();
    if(tblKey === "MASTER_STUDENTS") {
      toggleHostelFieldsVisibility();
      document.getElementById("photo-preview-box").style.display = "none";
      document.getElementById("photo-preview-box").innerHTML = "";
    }
  }
}

function handleUniversalEdit(tblKey, rowIdx, inputControlIds) {
  let valuesMatrix = JSON.parse(localStorage.getItem(tblKey)) || [];
  let targetRow = valuesMatrix[rowIdx];
  if (!targetRow) return;

  editingRowIndices[tblKey] = rowIdx;
  inputControlIds.forEach((id, idx) => {
    const inputControl = document.getElementById(id);
    if (inputControl) inputControl.value = targetRow[idx] || "";
  });

  if(tblKey === "MASTER_STUDENTS") {
    toggleHostelFieldsVisibility();
    const existingPhoto = fixBase64Image(targetRow[15]);
    const previewBox = document.getElementById("photo-preview-box");
    if(existingPhoto) {
      previewBox.innerHTML = `<img src="${existingPhoto}" style="width:100%; height:100%; object-fit:cover;">`;
      previewBox.style.display = "flex";
    } else {
      previewBox.style.display = "none";
    }
  }
  alert("Row parameters successfully bound to UI editors! Edit and commit form.");
}

function handleUniversalDelete(tblKey, rowIdx) {
  if(!confirm("Are you sure you want to delete this record?")) return;
  let valuesMatrix = JSON.parse(localStorage.getItem(tblKey)) || [];
  let targetRowData = valuesMatrix[rowIdx];
  if (!targetRowData) return;
  
  let recordId = targetRowData[targetRowData.length - 1];
  valuesMatrix.splice(rowIdx, 1);
  localStorage.setItem(tblKey, JSON.stringify(valuesMatrix));
  
  let targetTab = sheetTabForKey(tblKey);
  if (targetTab) syncWithGoogleSheet(targetTab, targetRowData, SYSTEM_SCHEMA[tblKey], "DELETE", recordId);
  
  renderAllTables();
  refreshFormDropdownLists();
}

function renderAllTables() {
  renderDatasetToTable("user-table-body", "MASTER_USERS", [0, 1, 3]);
  renderDatasetToTable("course-table-body", "MASTER_COURSES", [0, 1, 2]);
  renderDatasetToTable("class-table-body", "MASTER_CLASSES", [0, 1, 2]);
  renderDatasetToTable("subject-table-body", "MASTER_SUBJECTS", [0, 1, 2, 3]);
  renderDatasetToTable("staff-table-body", "MASTER_STAFFS", [0, 1, 2, 3]);
  renderDatasetToTable("allocation-table-body", "MASTER_ALLOCATIONS", [0, 1, 2]);
  renderDatasetToTable("student-table-body", "MASTER_STUDENTS", [0, 1, 2, 3, 4, 5, 6, 11]);
  renderAdminDashboardSummary();
}

function renderDatasetToTable(tbodyId, tblKey, displayColIndices) {
  const tbodyNode = document.getElementById(tbodyId);
  if (!tbodyNode) return;
  tbodyNode.innerHTML = "";

  const rawDataset = JSON.parse(localStorage.getItem(tblKey)) || [];
  const searchFilterVal = getSearchFilterText(tbodyId);

  rawDataset.forEach((row, originalRowIndex) => {
    if (searchFilterVal) {
      let containsMatchStr = row.some(col => String(col).toLowerCase().includes(searchFilterVal));
      if (!containsMatchStr) return;
    }

    let tr = document.createElement("tr");
    displayColIndices.forEach(colIdx => {
      let td = document.createElement("td");
      td.innerText = row[colIdx] || "";
      tr.appendChild(td);
    });

    let actionTd = document.createElement("td");
    actionTd.className = "actions-cell-flex";

    let editBtn = document.createElement("button");
    editBtn.className = "btn-table-edit";
    editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
    editBtn.addEventListener("click", () => {
      let targetInputIds = getInputIdsForTableKey(tblKey);
      handleUniversalEdit(tblKey, originalRowIndex, targetInputIds);
    });

    let delBtn = document.createElement("button");
    delBtn.className = "btn-table-del";
    delBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
    delBtn.addEventListener("click", () => {
      handleUniversalDelete(tblKey, originalRowIndex);
    });

    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbodyNode.appendChild(tr);
  });
}

function getSearchFilterText(tbodyId) {
  const searchInputsMap = {
    "user-table-body": "search-user", "course-table-body": "search-course", "class-table-body": "search-class",
    "subject-table-body": "search-subject", "staff-table-body": "search-staff", "allocation-table-body": "search-allocations",
    "student-table-body": "search-student"
  };
  const el = document.getElementById(searchInputsMap[tbodyId]);
  return el ? el.value.trim().toLowerCase() : "";
}

function triggerSearchFilter() {
  renderAllTables();
}

function getInputIdsForTableKey(tblKey) {
  const formsMapping = {
    MASTER_USERS: ["user-uid", "user-name", "user-pass", "user-role"],
    MASTER_COURSES: ["crs-code", "crs-name", "crs-dept"],
    MASTER_CLASSES: ["cls-id", "cls-name", "cls-course-select", "cls-dept"],
    MASTER_SUBJECTS: ["sub-code", "sub-name", "sub-course-select", "sub-dept"],
    MASTER_STAFFS: ["stf-id", "stf-name", "stf-dept", "stf-contact"],
    MASTER_ALLOCATIONS: ["alloc-staff-select", "alloc-class-select", "alloc-sub-select"],
    MASTER_STUDENTS: ["std-id", "std-name", "std-class-select", "std-course-select", "std-status", "std-dob", "std-age", "std-primary", "std-secondary", "std-10th", "std-12th", "std-accom", "std-hostel-name", "std-room", "std-address", "std-photo-hidden"],
    CLASS_TIMETABLES: ["tt-class-select", "tt-day-select"]
  };
  return formsMapping[tblKey] || [];
}

function saveTimetableRecord() {
  const classId = document.getElementById("tt-class-select").value;
  const targetDay = document.getElementById("tt-day-select").value;

  if (!classId || !targetDay) {
    alert("Please select Class and Day configurations!");
    return;
  }

  let dynamicPayload = [classId, targetDay];
  for (let hr = 1; hr <= 7; hr++) {
    const subVal = document.getElementById(`tt-sub-h${hr}`).value || "FREE PERIOD";
    const staffVal1 = document.getElementById(`tt-staff1-h${hr}`).value || "";
    const staffVal2 = document.getElementById(`tt-staff2-h${hr}`).value || "";
    const staffVal3 = document.getElementById(`tt-staff3-h${hr}`).value || "";
    
    let combinedStaffs = [staffVal1, staffVal2, staffVal3].filter(s => s !== "").join(" + ");
    if(!combinedStaffs) combinedStaffs = "NO FACULTY ASSIGNED";

    dynamicPayload.push(`${subVal}|${combinedStaffs}`);
  }

  let ttList = JSON.parse(localStorage.getItem("CLASS_TIMETABLES")) || [];
  let existingIndex = ttList.findIndex(row => row[0] === classId && row[1] === targetDay);

  let recordId = existingIndex > -1 ? ttList[existingIndex][ttList[existingIndex].length - 1] : "REC-TIM-" + Date.now();
  dynamicPayload.push(recordId);
  
  if (existingIndex > -1) ttList[existingIndex] = dynamicPayload;
  else ttList.push(dynamicPayload);

  localStorage.setItem("CLASS_TIMETABLES", JSON.stringify(ttList));
  renderTimetableGridDisplay();

  let targetTab = sheetTabForKey("CLASS_TIMETABLES");
  if (targetTab) syncWithGoogleSheet(targetTab, dynamicPayload, SYSTEM_SCHEMA["CLASS_TIMETABLES"], "CREATE");
  alert("Timetable Configurations Synchronized!");
}

function renderTimetableGridDisplay() {
  const classId = document.getElementById("tt-class-select").value;
  const gridContainer = document.getElementById("tt-matrix-runtime-grid");
  if (!gridContainer || !classId) return;
  buildTimetableGridStructure(gridContainer, classId);
}

function openTimetableModalPopup() {
  const modal = document.getElementById("timetable-popup-modal");
  if (modal) {
    modal.style.display = "flex";
    renderModalTimetableGrid(); 
  }
}

function closeTimetableModalPopup() {
  const modal = document.getElementById("timetable-popup-modal");
  if (modal) modal.style.display = "none";
}

function renderModalTimetableGrid() {
  const classId = document.getElementById("modal-tt-class-select").value;
  const gridContainer = document.getElementById("modal-tt-runtime-grid");
  if (!gridContainer) return;

  if (!classId) {
    gridContainer.innerHTML = `<p style="grid-column: span 11; text-align: center; color: var(--slate-400); padding: 40px 0;">Please select a class from the dropdown above to display its timetable grid.</p>`;
    return;
  }
  buildTimetableGridStructure(gridContainer, classId);
}

function buildTimetableGridStructure(gridContainer, classId) {
  gridContainer.innerHTML = "";
  const ttList = JSON.parse(localStorage.getItem("CLASS_TIMETABLES")) || [];
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const timeLabels = [
    "08:45-09:45\n(Period 1)", "09:45-10:45\n(Period 2)", "10:45-11:00\n(BREAK)",
    "11:00-12:00\n(Period 3)", "12:00-01:00\n(Period 4)", "01:00-02:00\n(LUNCH)",
    "02:00-03:00\n(Period 5)", "03:00-03:15\n(BREAK)", "03:15-04:15\n(Period 6)", "04:15-05:15\n(Period 7)"
  ];

  gridContainer.appendChild(createHeaderCell("DAY / TIMINGS"));
  timeLabels.forEach(lbl => gridContainer.appendChild(createHeaderCell(lbl)));

  days.forEach(dayName => {
    let dayRowCell = document.createElement("div");
    dayRowCell.className = "tt-cell tt-day";
    dayRowCell.innerText = dayName;
    gridContainer.appendChild(dayRowCell);

    let mappedDayData = ttList.find(row => row[0] === classId && row[1] === dayName);
    let periodTrackingCounter = 1;

    for (let currentSlot = 1; currentSlot <= 10; currentSlot++) {
      if (currentSlot === 3 || currentSlot === 8) {
        let breakCell = document.createElement("div");
        breakCell.className = "tt-cell tt-break"; breakCell.innerText = "BREAK";
        gridContainer.appendChild(breakCell); continue;
      }
      if (currentSlot === 6) {
        let lunchBreak = document.createElement("div");
        lunchBreak.className = "tt-cell tt-break"; lunchBreak.innerText = "LUNCH";
        gridContainer.appendChild(lunchBreak); continue;
      }

      let cellValue = mappedDayData ? mappedDayData[periodTrackingCounter + 1] : "";
      let cellNode = document.createElement("div");
      cellNode.className = "tt-cell";

      if (cellValue && cellValue.includes("|")) {
        let [sub, staff] = cellValue.split("|");
        cellNode.innerHTML = `<div class="tt-subject-title">${sub}</div><div class="tt-staff-lbl">${staff}</div>`;
      } else {
        cellNode.innerText = "-";
      }
      gridContainer.appendChild(cellNode);
      periodTrackingCounter++;
    }
  });
}

function createHeaderCell(text) {
  let cell = document.createElement("div");
  cell.className = "tt-header"; cell.style.whiteSpace = "pre-line"; cell.innerText = text;
  return cell;
}

function renderStaffDashboardConsole() {
  const staffName = activeUserSession.name;
  const staffIdField = document.getElementById("stf-dash-id");
  const staffNameField = document.getElementById("stf-dash-name");
  const staffDeptField = document.getElementById("stf-dash-dept");
  const allocationTbody = document.getElementById("stf-dash-allocations-tbody");

  if (!staffIdField) return;

  const staffList = JSON.parse(localStorage.getItem("MASTER_STAFFS")) || [];
  const allocationsList = JSON.parse(localStorage.getItem("MASTER_ALLOCATIONS")) || [];
  const subjectList = JSON.parse(localStorage.getItem("MASTER_SUBJECTS")) || [];
  const timetableList = JSON.parse(localStorage.getItem("CLASS_TIMETABLES")) || [];
  const attendanceLogs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];
  const activeDate = document.getElementById("att-date-picker")?.value || new Date().toISOString().split('T')[0];

  const profile = staffList.find(s => s[1] === staffName);
  staffIdField.innerText = profile ? profile[0] : activeUserSession.uid;
  staffNameField.innerText = staffName;
  staffDeptField.innerText = profile ? profile[2] : "Faculty Department Stream";

  const activeAllocations = allocationsList.filter(row => row[0] === staffName);
  if (activeAllocations.length === 0) {
    allocationTbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>No active allocations mapped to your account.</td></tr>";
    return;
  }

  allocationTbody.innerHTML = "";
  activeAllocations.forEach(alloc => {
    let subObj = subjectList.find(s => s[0] === alloc[2]);
    let subName = subObj ? subObj[1] : "Seminar / Lab Session";
    let targetClass = alloc[1]; 
    let targetSubjectCode = alloc[2]; 
    let matchingPeriods = [];

    timetableList.forEach(tt => {
      if (tt[0] === targetClass) {
        for (let hr = 1; hr <= 7; hr++) {
          let fieldVal = tt[hr + 1] || ""; 
          if (fieldVal.includes("|")) {
            let [subToken, staffToken] = fieldVal.split("|");
            if (subToken.trim() === targetSubjectCode && staffToken.includes(staffName)) {
              let checkKey = `${targetSubjectCode}_P${hr}`;
              let attendanceRecord = attendanceLogs.find(log => log[0] === activeDate && log[1] === checkKey && log[2] === targetClass);
              
              let statusLabel = attendanceRecord 
                ? ` <span onclick="redirectToAttendanceDirectly(\`${targetClass}\`, \`${targetSubjectCode}\`, ${hr})" style="font-size:10px; font-weight:700; color:#059669; background:#d1fae5; padding:2px 6px; border-radius:4px; margin-left:4px; cursor:pointer;">COMPLETED</span>`
                : ` <span onclick="redirectToAttendanceDirectly(\`${targetClass}\`, \`${targetSubjectCode}\`, ${hr})" style="font-size:10px; font-weight:700; color:#dc2626; background:#fee2e2; padding:2px 6px; border-radius:4px; margin-left:4px; cursor:pointer;">PENDING</span>`;
              
              matchingPeriods.push(`<div style="cursor:pointer; padding:2px 0;" onclick="redirectToAttendanceDirectly(\`${targetClass}\`, \`${targetSubjectCode}\`, ${hr})">${tt[1]} (Hour ${hr})${statusLabel}</div>`);
            }
          }
        }
      }
    });

    let periodsLabel = matchingPeriods.length > 0 ? matchingPeriods.join("") : "<em>Not Scheduled</em>";
    allocationTbody.insertAdjacentHTML("beforeend", `
      <tr><td><strong>${targetSubjectCode}</strong></td><td>${subName}</td><td>${targetClass}</td><td>${periodsLabel}</td></tr>
    `);
  });
}

function redirectToAttendanceDirectly(classId, subjectCode, hourNumber) {
  triggerNavigationTabChange("staff-attendance-section");
  const classSelect = document.getElementById("att-class-select");
  if (classSelect) {
    classSelect.value = classId;
    filterSubjectsByAssignedStaff();
    handleSubjectClickForPeriodSelection(subjectCode, classId);
    handlePeriodClickForStudentList(hourNumber, classId);
  }
}

let activeSelectedSubjectRuntime = "";
let activeSelectedPeriodRuntime = "";

function filterSubjectsByAssignedStaff() {
  const classSelect = document.getElementById("att-class-select");
  const listContainer = document.getElementById("att-students-list-view");
  if (!classSelect) return;

  const selectedClass = classSelect.value;
  if (!selectedClass) {
    listContainer.innerHTML = "<p style='padding: 20px; color: var(--slate-400);'>Choose target class sector first.</p>";
    return;
  }

  const subjectList = JSON.parse(localStorage.getItem("MASTER_SUBJECTS")) || [];
  const allocationsList = JSON.parse(localStorage.getItem("MASTER_ALLOCATIONS")) || [];
  const attendanceLogs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];
  const activeDate = document.getElementById("att-date-picker").value || new Date().toISOString().split('T')[0];
  let assignedSubjects = [];

  if (activeUserSession.role === "ADMIN") {
    assignedSubjects = subjectList;
  } else {
    const staffName = activeUserSession.name;
    const codes = allocationsList.filter(row => row[1] === selectedClass && row[0] === staffName).map(row => row[2]);
    assignedSubjects = subjectList.filter(s => codes.includes(s[0]));
  }

  if (assignedSubjects.length === 0) {
    listContainer.innerHTML = "<p style='padding: 20px;'>No subjects allocated for your profile in this class.</p>";
    return;
  }

  let html = `
    <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 15px;">
      <div class="form-field-group">
        <label style="font-weight: 700; color: var(--slate-800);">Step 1: Choose Mapped Subject</label>
        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
  `;

  assignedSubjects.forEach(sub => {
    const isAlreadyMarkedByCoStaff = attendanceLogs.some(log => log[0] === activeDate && log[1].startsWith(sub[0]) && log[2] === selectedClass && log[5] !== activeUserSession.name);
    const isMarkedByMe = attendanceLogs.some(log => log[0] === activeDate && log[1].startsWith(sub[0]) && log[2] === selectedClass && log[5] === activeUserSession.name);
    let statusBadge = `<span class="mode-badge" style="background:#fee2e2; color:#b91c1c;">Pending</span>`;
    
    if (new Date(activeDate) < new Date("2026-07-09")) {
      statusBadge = `<span class="mode-badge" style="background:var(--slate-200); color:var(--slate-600);">No Action</span>`;
    } else if (isMarkedByMe) {
      statusBadge = `<span class="mode-badge" style="background:#d1fae5; color:#065f46;">Completed (You)</span>`;
    } else if (isAlreadyMarkedByCoStaff) {
      statusBadge = `<span class="mode-badge" style="background:#e0f2fe; color:#0369a1;">Updated (Co-Staff)</span>`;
    }

    html += `
      <button type="button" class="action-btn" onclick="handleSubjectClickForPeriodSelection('${sub[0]}', '${selectedClass}')" style="background:var(--slate-800); text-align: left; height: auto; min-width: 250px; display:flex; flex-direction:column; gap:6px;">
        <div style="font-weight:700;">${sub[0]}</div><div style="font-size:12px;">${sub[1]}</div>${statusBadge}
      </button>`;
  });

  html += `</div></div><div id="dynamic-period-selection-wrapper"></div><div id="dynamic-student-checklist-wrapper"></div></div>`;
  listContainer.innerHTML = html;
}

function handleSubjectClickForPeriodSelection(subCode, classId) {
  activeSelectedSubjectRuntime = subCode;
  const periodWrapper = document.getElementById("dynamic-period-selection-wrapper");
  const studentWrapper = document.getElementById("dynamic-student-checklist-wrapper");
  if (!periodWrapper) return;
  
  studentWrapper.innerHTML = ""; 
  const timetables = JSON.parse(localStorage.getItem("CLASS_TIMETABLES")) || [];
  const attendanceLogs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const activeDateVal = document.getElementById("att-date-picker").value;
  const activeDayName = days[new Date(activeDateVal).getDay()].toUpperCase();
  const staffName = activeUserSession.name;

  let availablePeriods = [];
  const dayPlan = timetables.find(row => row[0] === classId && row[1].toUpperCase() === activeDayName);
  
  if (dayPlan) {
    for (let hr = 1; hr <= 7; hr++) {
      let cellData = dayPlan[hr + 1] || "";
      if (cellData.includes("|")) {
        let [subjectToken, staffToken] = cellData.split("|");
        if (subjectToken.trim() === subCode && (activeUserSession.role === "ADMIN" || staffToken.includes(staffName))) {
          availablePeriods.push(hr);
        }
      }
    }
  }

  if (availablePeriods.length === 0) {
    periodWrapper.innerHTML = `<div class="form-field-group"><p style="color:#dc2626; font-weight:600;">No periods assigned on ${activeDayName}.</p></div>`;
    return;
  }

  let html = `<div class="form-field-group" style="margin-top:15px;"><label>Step 2: Choose Mapped Period hour</label><div style="display:flex; gap:12px;">`;
  availablePeriods.forEach(p => {
    let subColumnKey = `${subCode}_P${p}`;
    let alreadyMarkedLog = attendanceLogs.find(log => log[0] === activeDateVal && log[1] === subColumnKey && log[2] === classId);

    if (alreadyMarkedLog) {
      html += `<button type="button" class="action-btn" disabled style="background:#059669; opacity:0.75;">Period ${p} (Done)</button>`;
    } else {
      html += `<button type="button" class="action-btn" onclick="handlePeriodClickForStudentList(${p}, '${classId}')" style="background:var(--sky-600);">Period ${p}</button>`;
    }
  });
  html += `</div></div>`;
  periodWrapper.innerHTML = html;
}

function handlePeriodClickForStudentList(periodNumber, classId) {
  activeSelectedPeriodRuntime = periodNumber;
  const studentWrapper = document.getElementById("dynamic-student-checklist-wrapper");
  if (!studentWrapper) return;

  const studentsList = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const classStudents = studentsList.filter(s => s[2] === classId);

  if (classStudents.length === 0) {
    studentWrapper.innerHTML = "<p>No student profiles registered in this section class.</p>";
    return;
  }

  const activeDate = document.getElementById("att-date-picker").value;
  const fullAttendanceLogs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];

  let html = `
    <div class="form-field-group" style="margin-top:20px;">
      <label>Step 3: Checklist (Subject: ${activeSelectedSubjectRuntime} | Period: ${periodNumber})</label>
      <table class="att-list-table">
        <thead><tr><th>Roll No</th><th>Full Name</th><th style="text-align:center;">Status</th></tr></thead>
        <tbody id="register-entries">
  `;

  classStudents.forEach(student => {
    let subColumnKey = `${activeSelectedSubjectRuntime}_P${periodNumber}`;
    let preExisting = fullAttendanceLogs.find(log => log[0] === activeDate && log[1] === subColumnKey && log[2] === classId && log[3] === student[0]);
    let status = preExisting ? preExisting[4] : "PRESENT";

    html += `
      <tr>
        <td><strong>${student[0]}</strong></td><td>${student[1]}</td>
        <td style="text-align:center;">
          <button type="button" class="att-status-btn ${status === "PRESENT" ? "present-state" : "absent-state"}" id="att-btn-${student[0]}" data-status="${status}">${status}</button>
        </td>
      </tr>`;
  });

  html += `</tbody></table></div>`;
  studentWrapper.innerHTML = html;

  classStudents.forEach(student => {
    const btn = document.getElementById(`att-btn-${student[0]}`);
    if (btn) {
      btn.addEventListener("click", () => {
        let currentStatus = btn.getAttribute("data-status");
        let nextStatus = currentStatus === "PRESENT" ? "ABSENT" : "PRESENT";
        btn.setAttribute("data-status", nextStatus);
        btn.innerText = nextStatus;
        btn.className = `att-status-btn ${nextStatus === "PRESENT" ? "present-state" : "absent-state"}`;
      });
    }
  });
}

function generateAttendanceRegisterForm() {
  filterSubjectsByAssignedStaff();
}

async function saveFacultyAttendanceRegister() {
  const classId = document.getElementById("att-class-select").value;
  const activeDate = document.getElementById("att-date-picker").value;
  
  if (!activeSelectedSubjectRuntime || !activeSelectedPeriodRuntime) {
    alert("Please select subject and click active period hour checklist first!");
    return;
  }

  const entriesBody = document.getElementById("register-entries");
  if (!entriesBody) return;

  const buttons = entriesBody.querySelectorAll(".att-status-btn");
  let logs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];
  setGlobalSyncState(true);

  const recordSubKey = `${activeSelectedSubjectRuntime}_P${activeSelectedPeriodRuntime}`;

  for (let btn of buttons) {
    let studentId = btn.id.replace("att-btn-", "");
    let capturedStatus = btn.getAttribute("data-status");
    let matchIdx = logs.findIndex(log => log[0] === activeDate && log[1] === recordSubKey && log[2] === classId && log[3] === studentId);
    let payload = [activeDate, recordSubKey, classId, studentId, capturedStatus, activeUserSession.name];
    let recordId = matchIdx > -1 ? logs[matchIdx][logs[matchIdx].length - 1] : "ATT-" + Date.now() + "-" + Math.floor(Math.random()*100);
    
    if (matchIdx > -1) {
      payload.push(recordId); logs[matchIdx] = payload;
      await syncWithGoogleSheet("Daily_Class_Attendance", payload, SYSTEM_SCHEMA.DAILY_ATTENDANCE, "UPDATE", recordId);
    } else {
      payload.push(recordId); logs.push(payload);
      await syncWithGoogleSheet("Daily_Class_Attendance", payload, SYSTEM_SCHEMA.DAILY_ATTENDANCE, "CREATE");
    }
  }

  localStorage.setItem("DAILY_ATTENDANCE", JSON.stringify(logs));
  setGlobalSyncState(false);
  alert("Attendance successfully stored and synchronized!");
  filterSubjectsByAssignedStaff();
}

/* ==========================================================================
   MARKS AND STUDENT SELF PROFILE REGISTRY FUNCTIONS
   ========================================================================== */

function filterSubjectsForMarksEntry() {
  const classId = document.getElementById("marks-class-select").value;
  const subjectSelect = document.getElementById("marks-subject-select");
  if(!subjectSelect) return;
  subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';

  if(!classId) return;
  const subjectList = JSON.parse(localStorage.getItem("MASTER_SUBJECTS")) || [];
  const allocationsList = JSON.parse(localStorage.getItem("MASTER_ALLOCATIONS")) || [];

  let assignedSubjects = [];
  if (activeUserSession.role === "ADMIN") {
    assignedSubjects = subjectList;
  } else {
    const staffName = activeUserSession.name;
    const codes = allocationsList.filter(row => row[1] === classId && row[0] === staffName).map(row => row[2]);
    assignedSubjects = subjectList.filter(s => codes.includes(s[0]));
  }

  assignedSubjects.forEach(sub => {
    let opt = document.createElement("option");
    opt.value = sub[0]; opt.text = `${sub[0]} - ${sub[1]}`;
    subjectSelect.appendChild(opt);
  });
}

function loadMarksEntrySheet() {
  const classId = document.getElementById("marks-class-select").value;
  const subCode = document.getElementById("marks-subject-select").value;
  const container = document.getElementById("marks-entry-container");
  if(!container) return;

  if(!classId || !subCode) {
    container.innerHTML = "<p style='padding:15px;'>Select parameters to load.</p>";
    return;
  }

  const studentsList = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const marksList = JSON.parse(localStorage.getItem("STUDENT_MARKS")) || [];
  const classStudents = studentsList.filter(s => s[2] === classId);

  if(classStudents.length === 0) {
    container.innerHTML = "<p style='padding:15px;'>No student profiles mapped.</p>";
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Roll No</th>
          <th>Name</th>
          <th>CIA 1 (20)</th>
          <th>CIA 2 (20)</th>
          <th>CIA 3 (20)</th>
          <th>Assignment (5)</th>
          <th>Attendance (5)</th>
          <th>Semester (100)</th>
          <th>Total (100)</th>
        </tr>
      </thead>
      <tbody>`;

  classStudents.forEach(st => {
    let record = marksList.find(m => m[0] === st[0] && m[1] === subCode) || ["", "", "0", "0", "0", "0", "0", "0", "0"];
    
    html += `
      <tr class="marks-row-node" data-student-id="${st[0]}">
        <td><strong>${st[0]}</strong></td>
        <td>${st[1]}</td>
        <td><input type="number" class="marks-input cia1" value="${record[2] || 0}" min="0" max="20" oninput="calculateRowTotalMarks(this)"></td>
        <td><input type="number" class="marks-input cia2" value="${record[3] || 0}" min="0" max="20" oninput="calculateRowTotalMarks(this)"></td>
        <td><input type="number" class="marks-input cia3" value="${record[4] || 0}" min="0" max="20" oninput="calculateRowTotalMarks(this)"></td>
        <td><input type="number" class="marks-input assgn" value="${record[5] || 0}" min="0" max="5" oninput="calculateRowTotalMarks(this)"></td>
        <td><input type="number" class="marks-input atten" value="${record[6] || 0}" min="0" max="5" oninput="calculateRowTotalMarks(this)"></td>
        <td><input type="number" class="marks-input semester-mark" value="${record[7] || 0}" min="0" max="100" oninput="calculateRowTotalMarks(this)"></td>
        <td><input type="number" class="marks-input total-score" value="${record[8] || 0}" readonly style="background:#e2e8f0; font-weight:700;"></td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function calculateRowTotalMarks(inputNode) {
  const row = inputNode.closest(".marks-row-node");
  
  let c1 = parseFloat(row.querySelector(".cia1").value) || 0; c1 = Math.min(c1, 20);
  let c2 = parseFloat(row.querySelector(".cia2").value) || 0; c2 = Math.min(c2, 20);
  let c3 = parseFloat(row.querySelector(".cia3").value) || 0; c3 = Math.min(c3, 20);
  let as = parseFloat(row.querySelector(".assgn").value) || 0; as = Math.min(as, 5);
  let at = parseFloat(row.querySelector(".atten").value) || 0; at = Math.min(at, 5);
  let sem = parseFloat(row.querySelector(".semester-mark").value) || 0; sem = Math.min(sem, 100);

  row.querySelector(".cia1").value = c1;
  row.querySelector(".cia2").value = c2;
  row.querySelector(".cia3").value = c3;
  row.querySelector(".assgn").value = as;
  row.querySelector(".atten").value = at;
  row.querySelector(".semester-mark").value = sem;

  const ciaMarks = [c1, c2, c3];
  ciaMarks.sort((a, b) => b - a); 
  const bestTwoCiaSum = ciaMarks[0] + ciaMarks[1];
  const internalTotal = bestTwoCiaSum + as + at;
  const semesterConverted = sem / 2;
  const finalTotal = internalTotal + semesterConverted;

  row.querySelector(".total-score").value = Math.round(finalTotal * 100) / 100;
}

async function saveStudentsMarksRegister() {
  const subCode = document.getElementById("marks-subject-select").value;
  const rows = document.querySelectorAll(".marks-row-node");
  if(!subCode || rows.length === 0) {
    alert("No records loaded to process!"); return;
  }

  let marksList = JSON.parse(localStorage.getItem("STUDENT_MARKS")) || [];
  setGlobalSyncState(true);

  for(let row of rows) {
    let sId = row.getAttribute("data-student-id");
    let c1 = row.querySelector(".cia1").value;
    let c2 = row.querySelector(".cia2").value;
    let c3 = row.querySelector(".cia3").value;
    let as = row.querySelector(".assgn").value;
    let at = row.querySelector(".atten").value;
    let sem = row.querySelector(".semester-mark").value; 
    let tot = row.querySelector(".total-score").value;

    let matchIdx = marksList.findIndex(m => m[0] === sId && m[1] === subCode);
    let payload = [sId, subCode, c1, c2, c3, as, at, sem, tot]; 
    let recordId = matchIdx > -1 ? marksList[matchIdx][marksList[matchIdx].length - 1] : "MRK-" + Date.now() + "-" + Math.floor(Math.random()*100);
    payload.push(recordId);

    if(matchIdx > -1) {
      marksList[matchIdx] = payload;
      await syncWithGoogleSheet("Student_Marks", payload, SYSTEM_SCHEMA.STUDENT_MARKS, "UPDATE", recordId);
    } else {
      marksList.push(payload);
      await syncWithGoogleSheet("Student_Marks", payload, SYSTEM_SCHEMA.STUDENT_MARKS, "CREATE");
    }
  }

  localStorage.setItem("STUDENT_MARKS", JSON.stringify(marksList));
  setGlobalSyncState(false);
  alert("Marks performance register synchronized successfully!");
}

function renderStudentSelfProfileViewer() {
  const studentUid = activeUserSession.uid;
  const students = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const attendance = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];
  const marks = JSON.parse(localStorage.getItem("STUDENT_MARKS")) || [];
  const currentStudent = students.find(s => s[0] == studentUid);

  if(!currentStudent) return;

  // Student Basic Meta Fields Binding
  document.getElementById("p-student-name").innerText = currentStudent[1];
  document.getElementById("p-student-id").innerText = currentStudent[0];
  document.getElementById("p-class-name").innerText = currentStudent[2];
  document.getElementById("p-course-name").innerText = currentStudent[3];
  document.getElementById("p-status").innerText = currentStudent[4];
  document.getElementById("p-dob").innerText = currentStudent[5];
  document.getElementById("p-age").innerText = currentStudent[6];
  document.getElementById("p-primary").innerText = currentStudent[7];
  document.getElementById("p-secondary").innerText = currentStudent[8] || "-";
  document.getElementById("p-marks").innerText = `10th: ${currentStudent[9]}% | 12th: ${currentStudent[10]}%`;
  document.getElementById("p-accommodation").innerText = currentStudent[11] === "Hostel" ? `Hostel: ${currentStudent[12]} (Room ${currentStudent[13]})` : "Dayscholar Division";
  document.getElementById("p-address").innerText = currentStudent[14];

  // Photo Render Fix Engine
  const frame = document.getElementById("p-student-photo-frame");
  if(currentStudent[15]) {
    const fixedImage = fixBase64Image(currentStudent[15]);
    frame.innerHTML = `<img src="${fixedImage}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src=''; this.parentElement.innerHTML='<i class class=\'fas fa-user-graduate\'></i>';">`;
  } else {
    frame.innerHTML = `<i class="fas fa-user-graduate"></i>`;
  }

  // Attendance Metrics Computation Engine
  const studentLogs = attendance.filter(log => log[3] == studentUid);
  const totalCapturedCount = studentLogs.length;
  const presentCount = studentLogs.filter(log => log[4] === "PRESENT").length;
  const absentCount = totalCapturedCount - presentCount;

  // 1. Overall Pie Chart Configuration Builder
  if (overallPieChartInstance) { overallPieChartInstance.destroy(); }
  const ctxOverall = document.getElementById('overallAttendancePieChart')?.getContext('2d');
  if (ctxOverall) {
    overallPieChartInstance = new Chart(ctxOverall, {
      type: 'pie',
      data: {
        labels: ['Present', 'Absent'],
        datasets: [{
          data: totalCapturedCount > 0 ? [presentCount, absentCount] : [1, 0],
          backgroundColor: totalCapturedCount > 0 ? ['#10b981', '#ef4444'] : ['#cbd5e1', '#cbd5e1'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  // 2. Subject Wise Distribution Analytics Computation Matrix
  let subjectStatsMap = {};
  studentLogs.forEach(log => {
    let rawSubKey = log[1] || "";
    let subCode = rawSubKey.split("_P")[0] || "General Track";
    if (!subjectStatsMap[subCode]) { subjectStatsMap[subCode] = { present: 0, total: 0 }; }
    subjectStatsMap[subCode].total++;
    if (log[4] === "PRESENT") { subjectStatsMap[subCode].present++; }
  });

  let subLabels = Object.keys(subjectStatsMap);
  let subPercentages = subLabels.map(lbl => {
    let item = subjectStatsMap[lbl];
    return Math.round((item.present / item.total) * 100);
  });

  if (subjectPieChartInstance) { subjectPieChartInstance.destroy(); }
  const ctxSubject = document.getElementById('subjectWiseAttendancePieChart')?.getContext('2d');
  if (ctxSubject) {
    subjectPieChartInstance = new Chart(ctxSubject, {
      type: 'pie',
      data: {
        labels: subLabels.length > 0 ? subLabels.map(l => `${l} (%)`) : ['No Data Mapped'],
        datasets: [{
          data: subPercentages.length > 0 ? subPercentages : [100],
          backgroundColor: subLabels.length > 0 ? ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'] : ['#cbd5e1'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  // Semester Wise & Overall Academic Ledger Generation Rendering Engine
  const markSectionWrapper = document.getElementById("student-semester-marks-block-wrapper");
  if(markSectionWrapper) {
    const studentMarks = marks.filter(m => m[0] == studentUid);
    
    if(studentMarks.length === 0) {
      markSectionWrapper.innerHTML = "<p style='color: var(--slate-400); padding:10px 0;'>No academic internal/external performance marks mapped yet.</p>";
    } else {
      let marksBySemMap = {};
      studentMarks.forEach(m => {
        let semIdx = m[7] || "Semester 1"; 
        if(!marksBySemMap[semIdx]) { marksBySemMap[semIdx] = []; }
        marksBySemMap[semIdx].push(m);
      });

      let htmlBuffer = "";
      let totalSumMarks = 0;
      let subjectCountOverall = 0;

      Object.keys(marksBySemMap).forEach(semesterLabel => {
        htmlBuffer += `
          <h4 style="font-size:15px; font-weight:700; color:var(--slate-800); margin: 20px 0 10px 0; text-transform: uppercase;">
            <i class="fas fa-bookmark" style="color:var(--primary-accent); margin-right:8px;"></i>${semesterLabel} Records Ledger
          </h4>
          <div class="table-container" style="margin-top: 10px; margin-bottom: 25px;">
            <table>
              <thead>
                <tr>
                  <th>Subject Index</th>
                  <th>CIA 1 (20)</th>
                  <th>CIA 2 (20)</th>
                  <th>CIA 3 (20)</th>
                  <th>Assignment (5)</th>
                  <th>Attendance (5)</th>
                  <th>Internal Sum</th>
                  <th>Semester Exam</th>
                  <th>Aggregate (100)</th>
                </tr>
              </thead>
              <tbody>`;
        
        marksBySemMap[semesterLabel].forEach(m => {
          let c1 = parseFloat(m[2]) || 0;
          let c2 = parseFloat(m[3]) || 0;
          let c3 = parseFloat(m[4]) || 0;
          let as = parseFloat(m[5]) || 0;
          let at = parseFloat(m[6]) || 0;
          let sem = parseFloat(m[7]) || 0; 
          let tot = parseFloat(m[8]) || 0;

          const ciaSorted = [c1, c2, c3].sort((a, b) => b - a);
          const internalComputedSum = (ciaSorted[0] + ciaSorted[1]) + as + at;

          totalSumMarks += tot;
          subjectCountOverall++;

          htmlBuffer += `
            <tr>
              <td><strong>${m[1]}</strong></td>
              <td>${c1}</td>
              <td>${c2}</td>
              <td>${c3}</td>
              <td>${as}</td>
              <td>${at}</td>
              <td><span style="font-weight:600; color:var(--slate-700);">${internalComputedSum}</span></td>
              <td>${m[7]}</td>
              <td><span style="font-weight:700; color:var(--sky-600);">${tot}</span></td>
            </tr>`;
        });

        htmlBuffer += `</tbody></table></div>`;
      });

      let absolutePerformanceAverage = subjectCountOverall > 0 ? Math.round((totalSumMarks / subjectCountOverall) * 100) / 100 : 0;
      htmlBuffer += `
        <div class="profile-card" style="grid-template-columns: repeat(2, 1fr); background: var(--slate-50); border: 1px dashed var(--slate-300); margin-top:20px;">
          <div class="info-tile" style="border-left: 4px solid var(--primary-accent);"><span>Total Cumulative Subjects</span><p>${subjectCountOverall}</p></div>
          <div class="info-tile" style="border-left: 4px solid var(--sky-500);"><span>Overall GPA Performance / Percentage</span><p>${absolutePerformanceAverage}%</p></div>
        </div>`;
        
      markSectionWrapper.innerHTML = htmlBuffer;
    }
  }
}

window.redirectToAttendanceDirectly = redirectToAttendanceDirectly;
window.renderStaffDashboardConsole = renderStaffDashboardConsole;
window.filterSubjectsForMarksEntry = filterSubjectsForMarksEntry;
window.loadMarksEntrySheet = loadMarksEntrySheet;
window.calculateRowTotalMarks = calculateRowTotalMarks;
window.saveStudentsMarksRegister = saveStudentsMarksRegister;
window.generateAttendanceRegisterForm = generateAttendanceRegisterForm;
window.saveFacultyAttendanceRegister = saveFacultyAttendanceRegister;
window.handleSystemLogin = handleSystemLogin;
window.handleLogout = handleLogout;
window.triggerSearchFilter = triggerSearchFilter;
window.handleFormSubmission = handleFormSubmission;
window.handlePhotoUpload = handlePhotoUpload;
window.calculateStudentAgeRuntime = calculateStudentAgeRuntime;
window.toggleHostelFieldsVisibility = toggleHostelFieldsVisibility;
window.toggleTimetablePlannerMode = toggleTimetablePlannerMode;
window.saveTimetableRecord = saveTimetableRecord;
window.openTimetableModalPopup = openTimetableModalPopup;
window.closeTimetableModalPopup = closeTimetableModalPopup;
window.renderModalTimetableGrid = renderModalTimetableGrid;
window.syncAllFromGoogleSheets = syncAllFromGoogleSheets;

// பிரிண்ட் செய்வதற்கான புதிய பங்க்ஷன் - கோப்பின் இறுதியில் சேர்க்கவும்
function printStudentProfileCard() {
  const studentUid = activeUserSession.uid;
  const students = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const currentStudent = students.find(s => s[0] == studentUid);

  if (!currentStudent) {
    alert("Student profile not found to print!");
    return;
  }

  const studentName = currentStudent[1];
  const rollNo = currentStudent[0];
  const className = currentStudent[2];
  const courseName = currentStudent[3];
  const status = currentStudent[4];
  const dob = currentStudent[5];
  const age = currentStudent[6];
  const primaryContact = currentStudent[7];
  const secondaryContact = currentStudent[8] || "-";
  const scholasticMarks = `10th: ${currentStudent[9]}% | 12th: ${currentStudent[10]}%`;
  const accommodation = currentStudent[11] === "Hostel" ? `Hostel: ${currentStudent[12]} (Room ${currentStudent[13]})` : "Dayscholar Division";
  const address = currentStudent[14];
  const photoSrc = currentStudent[15] ? fixBase64Image(currentStudent[15]) : '';

  // புதிய விண்டோ ஓபன் செய்தல்
  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  
  // A4 அளவில் லோகோ மற்றும் விபரங்களுடன் கூடிய HTML ஸ்ட்ரக்சர்
  printWindow.document.write(`
    <html>
    <head>
      <title>Student Profile - ${rollNo}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; color: #0f172a; margin: 0; padding: 0; background: #fff; line-height: 1.5; }
        .print-container { width: 100%; max-width: 800px; margin: 0 auto; }
        
        /* 4 Logos Header */
        .logo-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #cbd5e1; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-header img { height: 55px; object-fit: contain; }
        
        .title-banner { text-align: center; margin-bottom: 30px; }
        .title-banner h2 { margin: 0; font-size: 22px; color: #0f172a; letter-spacing: 1px; }
        .title-banner p { margin: 5px 0 0 0; font-size: 14px; color: #64748b; font-weight: 500; }
        
        /* Profile Section */
        .profile-grid { display: grid; grid-template-columns: 1fr 180px; gap: 30px; margin-bottom: 30px; }
        
        /* Details Table */
        .details-table { width: 100%; border-collapse: collapse; }
        .details-table td { padding: 10px 12px; vertical-align: top; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .details-table td.label { font-weight: 600; color: #475569; width: 40%; }
        .details-table td.value { color: #0f172a; }
        
        /* Photo Box */
        .photo-wrapper { text-align: right; }
        .photo-box { width: 150px; height: 170px; border: 1px solid #cbd5e1; border-radius: 8px; display: inline-block; overflow: hidden; background: #f8fafc; }
        .photo-box img { width: 100%; height: 100%; object-fit: cover; }
        .photo-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 12px; text-align: center; padding: 10px; }
        
        /* Footer */
        .print-footer { margin-top: 60px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="print-container">
        <!-- Top 4 Logos -->
        <div class="logo-header">
          <img src="SASTRA_Logo.jpg" alt="SASTRA">
          <img src="Greaves_Logo.jpg" alt="Greaves">
          <img src="Swati_Logo.jpg" alt="Swati">
          <img src="Pygmalion_Foundation_logo.jpg" alt="Pygmalion">
        </div>
        
        <div class="title-banner">
          <h2>SWATI WOMEN'S PROGRAM</h2>
          <p>Official Student Profile Record</p>
        </div>
        
        <div class="profile-grid">
          <!-- Left: Details Table -->
          <div>
            <table class="details-table">
              <tr>
                <td class="label">Student Name</td>
                <td class="value">: <strong>${studentName}</strong></td>
              </tr>
              <tr>
                <td class="label">Roll Number / ID</td>
                <td class="value">: ${rollNo}</td>
              </tr>
              <tr>
                <td class="label">Enrolled Class</td>
                <td class="value">: ${className}</td>
              </tr>
              <tr>
                <td class="label">Course Track</td>
                <td class="value">: ${courseName}</td>
              </tr>
              <tr>
                <td class="label">Date of Birth (Age)</td>
                <td class="value">: ${dob} (${age} Years)</td>
              </tr>
              <tr>
                <td class="label">Primary Contact</td>
                <td class="value">: ${primaryContact}</td>
              </tr>
              <tr>
                <td class="label">Secondary Contact</td>
                <td class="value">: ${secondaryContact}</td>
              </tr>
              <tr>
                <td class="label">Scholastic Marks</td>
                <td class="value">: ${scholasticMarks}</td>
              </tr>
              <tr>
                <td class="label">Accommodation</td>
                <td class="value">: ${accommodation}</td>
              </tr>
              <tr>
                <td class="label">Permanent Address</td>
                <td class="value">: ${address}</td>
              </tr>
              <tr>
                <td class="label">Profile Status</td>
                <td class="value">: ${status}</td>
              </tr>
            </table>
          </div>
          
          <!-- Right: Photo -->
          <div class="photo-wrapper">
            <div class="photo-box">
              ${photoSrc ? `<img src="${photoSrc}">` : `<div class="photo-placeholder">No Photo Available</div>`}
            </div>
          </div>
        </div>
        
        <!-- Verification Signatures Footer -->
        <div class="print-footer">
          <div style="text-align: right; font-weight: 500; margin-top: 40px; border-top: 1px dashed #94a3b8; padding-top: 5px; width: 150px;">Authorized Signature</div>
        </div>
      </div>
      
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 500);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// பழைய விண்டோஸ் எக்ஸ்போர்ட் உடன் இணைக்கவும்
window.printStudentProfileCard = printStudentProfileCard;

// 1. அட்டெண்டன்ஸ் செக்ஷன் ஓபன் ஆகும்போது பேட்ச் லிஸ்ட்டை லோடு செய்யும் ஃபங்க்ஷன்
function initEventAttendanceTab() {
  const students = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const batchSelect = document.getElementById("event-batch-select");
  
  // இன்றைய தேதியைத் தானாக செட் செய்ய
  document.getElementById("event-date").value = new Date().toISOString().split('T')[0];
  
  // தனித்துவமான (Unique) பேட்ச்களை மட்டும் பிரித்தெடுக்க
  const batches = [...new Set(students.map(s => s[2]))].filter(Boolean); 
  
  batchSelect.innerHTML = '<option value="">-- Select a Batch --</option>';
  batches.forEach(batch => {
    const opt = document.createElement("option");
    opt.value = batch;
    opt.textContent = batch;
    batchSelect.appendChild(opt);
  });
  
  document.getElementById("attendance-list-card").style.display = "none";
}

// 2. செலக்ட் செய்த பேட்ச் மாணவர்களை டேபிளில் காட்டும் ஃபங்க்ஷன்
function loadStudentsForAttendance() {
  const selectedBatch = document.getElementById("event-batch-select").value;
  const students = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const tbody = document.getElementById("attendance-students-body");
  
  if (!selectedBatch) {
    document.getElementById("attendance-list-card").style.display = "none";
    return;
  }
  
  // குறிப்பிட்ட பேட்ச் மாணவர்களை மட்டும் ஃபில்டர் செய்தல்
  const filteredStudents = students.filter(s => s[2] === selectedBatch);
  
  tbody.innerHTML = "";
  
  if (filteredStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px; color:#64748b;">No students found in this batch.</td></tr>`;
  } else {
    filteredStudents.forEach(student => {
      const rollNo = student[0];
      const name = student[1];
      
      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid #f1f5f9";
      row.innerHTML = `
        <td style="padding:12px;">${rollNo}</td>
        <td style="padding:12px;"><strong>${name}</strong></td>
        <td style="padding:12px; text-align:center;">
          <label style="margin-right:15px; cursor:pointer; color:#16a34a; font-weight:600;">
            <input type="radio" name="att_${rollNo}" value="Present" checked style="accent-color:#16a34a;"> Present
          </label>
          <label style="cursor:pointer; color:#dc2626; font-weight:600;">
            <input type="radio" name="att_${rollNo}" value="Absent" style="accent-color:#dc2626;"> Absent
          </label>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
  
  document.getElementById("attendance-list-card").style.display = "block";
}

// 3. அட்டெண்டன்ஸ் டேட்டாவைச் சேமிக்கும் ஃபங்க்ஷன் (Google Sheets-க்கு அனுப்பத் தயார் செய்தல்)
function submitEventAttendance() {
  const date = document.getElementById("event-date").value;
  const desc = document.getElementById("event-desc").value;
  const batch = document.getElementById("event-batch-select").value;
  
  if (!date || !desc || !batch) {
    alert("Please fill all the details before saving!");
    return;
  }
  
  const students = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const filteredStudents = students.filter(s => s[2] === batch);
  
  const attendanceData = [];
  
  filteredStudents.forEach(student => {
    const rollNo = student[0];
    const name = student[1];
    const radioOpts = document.getElementsByName(`att_${rollNo}`);
    let status = "Present";
    
    for (const opt of radioOpts) {
      if (opt.checked) {
        status = opt.value;
        break;
      }
    }
    
    attendanceData.push({
      date: date,
      description: desc,
      batch: batch,
      rollNo: rollNo,
      name: name,
      status: status
    });
  });
  
  console.log("Attendance Data to Save:", attendanceData);
  alert("Attendance marked successfully local-wise! (Ready to push to Google Sheet)");
  
  // குறிப்பு: உங்களுடைய கூகுள் ஷீட்ஸ் பைப்லைனுடன் இதை இணைக்க google.script.run வழியாக இந்த டேட்டாவை அனுப்பிக் கொள்ளலாம்.
}

// டேப் மாறும் போது பேட்ச் விவரங்களை லோடு செய்ய
// உங்களுடைய switchAdminTab ஃபங்க்ஷனில் இதைக் கால் செய்யவும்:
// if(tabId === 'event-attendance-section') initEventAttendanceTab();
window.switchAdminTabWrapper = function(tabId) {
  if(typeof switchAdminTab === 'function') {
    switchAdminTab(tabId);
  }
  if(tabId === 'event-attendance-section') {
    initEventAttendanceTab();
  }
};
