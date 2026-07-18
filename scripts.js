/* ==========================================================================
   INSTITUTIONAL CORE SYSTEM ENGINE (MODULAR RUNTIME) - OPTIMIZED WITH PHOTO UPLOADER
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
  MASTER_USERS: -1,
  MASTER_COURSES: -1,
  MASTER_CLASSES: -1,
  MASTER_SUBJECTS: -1,
  MASTER_STAFFS: -1,
  MASTER_ALLOCATIONS: -1,
  MASTER_STUDENTS: -1,
  CLASS_TIMETABLES: -1,
  DAILY_ATTENDANCE: -1,
  STUDENT_MARKS: -1
};

window.addEventListener("DOMContentLoaded", () => {
  initializeLocalDatabases();
  setupGlobalEvents();
  autoLoginIfSessionExists();
  
  const datePicker = document.getElementById("att-date-picker");
  if (datePicker && !datePicker.value) {
    datePicker.value = new Date().toISOString().split('T')[0];
  }
});

function initializeLocalDatabases() {
  Object.keys(SYSTEM_SCHEMA).forEach(key => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify([]));
    }
  });
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
    tabName: sheetTab,       
    action: action,
    payload: payload,
    headers: headers,
    rowId: recordId          
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

  let dayscholarCount = 0;
  let hostelerCount = 0;
  
  students.forEach(student => {
    let accommodation = student[11] ? String(student[11]).trim().toLowerCase() : "";
    if (accommodation === "dayscholar") {
      dayscholarCount++;
    } else if (accommodation === "hostel") {
      hostelerCount++;
    }
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

function sheetTabForKey(key, optionalRowData = null) {
  const map = {
    MASTER_USERS: "Master_Users",
    MASTER_COURSES: "Master_Courses",
    MASTER_CLASSES: "Master_Classes",
    MASTER_SUBJECTS: "Master_Subjects",
    MASTER_STAFFS: "Master_Staffs",
    MASTER_ALLOCATIONS: "Master_Allocations", 
    MASTER_STUDENTS: "Master_Students",
    CLASS_TIMETABLES: "Class_Timetables",
    DAILY_ATTENDANCE: "Daily_Class_Attendance",
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
  const adminAttType = document.getElementById("admin-att-type-wrapper");

  if (role === "ADMIN") {
    adminMenuOpts.forEach(el => el.style.display = "flex");
    staffMenuOpts.forEach(el => el.style.display = "none"); 
    document.getElementById("student-menu-profile").style.display = "none";
    if (adminAttType) adminAttType.style.display = "flex"; 
    document.getElementById("mode-flag-badge").innerText = "ADMIN PORTAL";
    triggerNavigationTabChange("dashboard-section");
  } else if (role === "STAFF") {
    adminMenuOpts.forEach(el => el.style.display = "none");
    staffMenuOpts.forEach(el => el.style.display = "flex"); 
    document.getElementById("student-menu-profile").style.display = "none";
    if (adminAttType) adminAttType.style.display = "none"; 
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
    formValues[12] = ""; 
    formValues[13] = ""; 
  }

  let activeIndex = editingRowIndices[tblKey];
  let recordId = "";

  if (activeIndex > -1) {
    let targetRowData = valuesMatrix[activeIndex];
    recordId = targetRowData[targetRowData.length - 1]; 
    formValues.push(recordId);
    valuesMatrix[activeIndex] = formValues;
    editingRowIndices[tblKey] = -1;

    let targetTab = sheetTabForKey(tblKey, formValues);
    if (targetTab) syncWithGoogleSheet(targetTab, formValues, SYSTEM_SCHEMA[tblKey], "UPDATE", recordId);
  } else {
    recordId = "REC-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    formValues.push(recordId);
    valuesMatrix.push(formValues);

    let targetTab = sheetTabForKey(tblKey, formValues);
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
    const existingPhoto = targetRow[15];
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

function renderAllTables() {
  renderDatasetToTable("user-table-body", "MASTER_USERS", [0, 1, 3], ["UID", "Name", "Role"]);
  renderDatasetToTable("course-table-body", "MASTER_COURSES", [0, 1, 2], ["Course Code", "Course Name", "Dept"]);
  renderDatasetToTable("class-table-body", "MASTER_CLASSES", [0, 1, 2], ["Class ID", "Class Name", "Course Code"]);
  renderDatasetToTable("subject-table-body", "MASTER_SUBJECTS", [0, 1, 2, 3], ["Subject Code", "Subject Name", "Course Code", "Dept"]);
  renderDatasetToTable("staff-table-body", "MASTER_STAFFS", [0, 1, 2, 3], ["Staff ID", "Name", "Dept", "Contact"]);
  renderDatasetToTable("allocation-table-body", "MASTER_ALLOCATIONS", [0, 1, 2], ["Faculty", "Class ID", "Subject Code"]);
  renderDatasetToTable("student-table-body", "MASTER_STUDENTS", [0, 1, 2, 3, 4, 5, 6, 11], ["ID", "Name", "Class", "Course", "Status", "DOB", "Age", "Accom"]);
  
  renderAdminDashboardSummary();
}

function renderDatasetToTable(tbodyId, tblKey, displayColIndices, headerLabels) {
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
    "user-table-body": "search-user",
    "course-table-body": "search-course",
    "class-table-body": "search-class",
    "subject-table-body": "search-subject",
    "staff-table-body": "search-staff",
    "allocation-table-body": "search-allocations",
    "student-table-body": "search-student"
  };
  const el = document.getElementById(searchInputsMap[tbodyId]);
  return el ? el.value.trim().toLowerCase() : "";
}

function triggerSearchFilter(tbodyId) {
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

  let recordId = existingIndex > -1 ? ttList[existingIndex][ttList[existingIndex].length - 1] : "REC-" + Date.now();
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

  gridContainer.innerHTML = "";
  const ttList = JSON.parse(localStorage.getItem("CLASS_TIMETABLES")) || [];
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  const timeLabels = [
    "08:45-09:45\n(Period 1)", "09:45-10:45\n(Period 2)", "10:45-11:00\n(BREAK)",
    "11:00-12:00\n(Period 3)", "12:00-01:00\n(Period 4)", "01:00-02:00\n(LUNCH)",
    "02:00-03:00\n(Period 5)", "03:00-03:15\n(BREAK)", "03:15-04:15\n(Period 6)", "04:15-05:16\n(Period 7)"
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
      if (currentSlot === 3) {
        let breakCell = document.createElement("div");
        breakCell.className = "tt-cell tt-break";
        breakCell.innerText = "BREAK";
        gridContainer.appendChild(breakCell);
        continue;
      }
      if (currentSlot === 6) {
        let lunchBreak = document.createElement("div");
        lunchBreak.className = "tt-cell tt-break";
        lunchBreak.innerText = "LUNCH";
        gridContainer.appendChild(lunchBreak);
        continue;
      }
      if (currentSlot === 8) {
        let breakCell = document.createElement("div");
        breakCell.className = "tt-cell tt-break";
        breakCell.innerText = "BREAK";
        gridContainer.appendChild(breakCell);
        continue;
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
  cell.className = "tt-header";
  cell.style.whiteSpace = "pre-line";
  cell.innerText = text;
  return cell;
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
  if (modal) {
    modal.style.display = "none";
  }
}

function renderModalTimetableGrid() {
  const classId = document.getElementById("modal-tt-class-select").value;
  const gridContainer = document.getElementById("modal-tt-runtime-grid");
  if (!gridContainer) return;

  if (!classId) {
    gridContainer.innerHTML = `<p style="grid-column: span 11; text-align: center; color: var(--slate-400); padding: 40px 0;">Please select a class from the dropdown above to display its timetable grid.</p>`;
    return;
  }

  gridContainer.innerHTML = "";
  const ttList = JSON.parse(localStorage.getItem("CLASS_TIMETABLES")) || [];
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  const timeLabels = [
    "08:45-09:45\n(Period 1)", "09:45-10:45\n(Period 2)", "10:45-11:00\n(BREAK)",
    "11:00-12:00\n(Period 3)", "12:00-01:00\n(Period 4)", "01:00-02:00\n(LUNCH)",
    "02:00-03:00\n(Period 5)", "03:00-03:15\n(BREAK)", "03:15-04:15\n(Period 6)", "04:15-05:16\n(Period 7)"
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
      if (currentSlot === 3) {
        let breakCell = document.createElement("div");
        breakCell.className = "tt-cell tt-break";
        breakCell.innerText = "BREAK";
        gridContainer.appendChild(breakCell);
        continue;
      }
      if (currentSlot === 6) {
        let lunchBreak = document.createElement("div");
        lunchBreak.className = "tt-cell tt-break";
        lunchBreak.innerText = "LUNCH";
        gridContainer.appendChild(lunchBreak);
        continue;
      }
      if (currentSlot === 8) {
        let breakCell = document.createElement("div");
        breakCell.className = "tt-cell tt-break";
        breakCell.innerText = "BREAK";
        gridContainer.appendChild(breakCell);
        continue;
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
              let attendanceRecord = attendanceLogs.find(log => 
                log[0] === activeDate && 
                log[1] === checkKey && 
                log[2] === targetClass
              );

              let statusLabel = "";
              if (attendanceRecord) {
                statusLabel = ` <span style="font-size:10px; font-weight:700; color:#059669; background:#d1fae5; padding:2px 6px; border-radius:4px; margin-left:4px;">COMPLETED (By ${attendanceRecord[5]})</span>`;
              } else {
                statusLabel = ` <span style="font-size:10px; font-weight:700; color:#dc2626; background:#fee2e2; padding:2px 6px; border-radius:4px; margin-left:4px;">PENDING</span>`;
              }

              matchingPeriods.push(`${tt[1]} (Hour ${hr})${statusLabel}`);
            }
          }
        }
      }
    });

    let periodsLabel = matchingPeriods.length > 0 
      ? matchingPeriods.join("<br/>") 
      : "<span style='color:var(--slate-400); font-style:italic;'>Not Scheduled in Timetable yet</span>";

    let tr = `
      <tr>
        <td><strong>${targetSubjectCode}</strong></td>
        <td>${subName}</td>
        <td>${targetClass}</td>
        <td><div style="line-height:1.8;">${periodsLabel}</div></td>
      </tr>`;
    allocationTbody.insertAdjacentHTML("beforeend", tr);
  });
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
    const codes = allocationsList
      .filter(row => row[1] === selectedClass && row[0] === staffName)
      .map(row => row[2]);
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
    const isAlreadyMarkedByCoStaff = attendanceLogs.some(log => 
      log[0] === activeDate && 
      log[1].startsWith(sub[0]) && 
      log[2] === selectedClass && 
      log[5] !== activeUserSession.name
    );

    const isMarkedByMe = attendanceLogs.some(log => 
      log[0] === activeDate && 
      log[1].startsWith(sub[0]) && 
      log[2] === selectedClass && 
      log[5] === activeUserSession.name
    );

    let statusBadge = `<span class="mode-badge" style="background:#fee2e2; color:#b91c1c;">Pending</span>`;
    
    const parsedTargetDate = new Date(activeDate);
    const limitDate = new Date("2026-07-09");
    if (parsedTargetDate < limitDate) {
      statusBadge = `<span class="mode-badge" style="background:var(--slate-200); color:var(--slate-600);">No Action (Before July 09)</span>`;
    } else if (isMarkedByMe) {
      statusBadge = `<span class="mode-badge" style="background:#d1fae5; color:#065f46;">Completed (By You)</span>`;
    } else if (isAlreadyMarkedByCoStaff) {
      statusBadge = `<span class="mode-badge" style="background:#e0f2fe; color:#0369a1;">Already Updated (Co-Staff)</span>`;
    }

    html += `
      <button type="button" class="action-btn" onclick="handleSubjectClickForPeriodSelection('${sub[0]}', '${selectedClass}')" style="background:var(--slate-800); text-align: left; height: auto; min-width: 250px; flex: 1; display:flex; flex-direction:column; gap:6px;">
        <div style="font-weight:700;">${sub[0]}</div>
        <div style="font-size:12px; font-weight:normal; opacity:0.8;">${sub[1]}</div>
        ${statusBadge}
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
  
  const activeDateVal = document.getElementById("att-date-picker").value || new Date().toISOString().split('T')[0];
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
    periodWrapper.innerHTML = `
      <div class="form-field-group" style="margin-top: 15px;">
        <label style="font-weight: 700; color: var(--slate-800);">Step 2: Choose Mapped Period hour</label>
        <p style="color: #dc2626; font-weight: 600; padding: 10px 0;">
          No periods assigned for you on ${activeDayName} in the timetable.
        </p>
      </div>`;
    return;
  }

  let html = `
    <div class="form-field-group" style="margin-top: 15px;">
      <label style="font-weight: 700; color: var(--slate-800);">Step 2: Choose Mapped Period hour</label>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
  `;

  availablePeriods.forEach(p => {
    let subColumnKey = `${subCode}_P${p}`;
    
    let alreadyMarkedLog = attendanceLogs.find(log => 
      log[0] === activeDateVal && 
      log[1] === subColumnKey && 
      log[2] === classId
    );

    if (alreadyMarkedLog) {
      let markerName = alreadyMarkedLog[5];
      let isByMe = markerName === staffName;
      
      html += `
        <button type="button" class="action-btn" disabled style="background:#059669; min-width: 150px; text-align:center; opacity: 0.75; cursor: not-allowed;">
          Period ${p} <br/>
          <span style="font-size:10px; font-weight:600; opacity:0.9;">
            ${isByMe ? 'COMPLETED (You)' : `COMPLETED (${markerName})`}
          </span>
        </button>`;
    } else {
      html += `
        <button type="button" class="action-btn" onclick="handlePeriodClickForStudentList(${p}, '${classId}')" style="background:var(--sky-600); min-width: 150px; text-align:center;">
          Period ${p} <br/>
          <span style="font-size:10px; font-weight:600; opacity:0.8;">PENDING</span>
        </button>`;
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
    studentWrapper.innerHTML = "<p style='padding: 15px;'>No student profiles registered in this section class.</p>";
    return;
  }

  const activeDate = document.getElementById("att-date-picker").value || new Date().toISOString().split('T')[0];
  const fullAttendanceLogs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];

  let html = `
    <div class="form-field-group" style="margin-top:20px;">
      <label style="font-weight: 700; color: var(--slate-800);">Step 3: Present / Absent Checklist (Subject: ${activeSelectedSubjectRuntime} | Period: ${periodNumber})</label>
      <table class="att-list-table">
        <thead>
          <tr>
            <th>Student Roll No</th>
            <th>Full Name</th>
            <th style="text-align:center;">Action Status</th>
          </tr>
        </thead>
        <tbody id="register-entries">
  `;

  classStudents.forEach(student => {
    let subColumnKey = `${activeSelectedSubjectRuntime}_P${periodNumber}`;
    let preExisting = fullAttendanceLogs.find(log => 
      log[0] === activeDate && 
      log[1] === subColumnKey && 
      log[2] === classId && 
      log[3] === student[0]
    );

    let status = preExisting ? preExisting[4] : "PRESENT";

    html += `
      <tr>
        <td><strong>${student[0]}</strong></td>
        <td>${student[1]}</td>
        <td style="text-align:center;">
          <button type="button" class="att-status-btn ${status === "PRESENT" ? "present-state" : "absent-state"}" id="att-btn-${student[0]}" data-status="${status}">
            ${status}
          </button>
        </td>
      </tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

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
  const activeDate = document.getElementById("att-date-picker").value || new Date().toISOString().split('T')[0];
  
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
    let recordId = matchIdx > -1 ? logs[matchIdx][logs[matchIdx].length - 1] : "REC-ATT-" + Date.now() + "-" + Math.floor(Math.random()*1000);
    payload.push(recordId);

    if (matchIdx > -1) logs[matchIdx] = payload;
    else logs.push(payload);

    await syncWithGoogleSheet("Daily_Class_Attendance", payload, SYSTEM_SCHEMA["DAILY_ATTENDANCE"], "CREATE");
  }

  localStorage.setItem("DAILY_ATTENDANCE", JSON.stringify(logs));
  setGlobalSyncState(false);
  alert("Success: Verification sheet successfully updated and synchronized!");
  
  renderStaffDashboardConsole();
  filterSubjectsByAssignedStaff();
}

function renderStudentSelfProfileViewer() {
  const loggedStudentID = activeUserSession.uid;
  const studentsList = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const classesList = JSON.parse(localStorage.getItem("MASTER_CLASSES")) || [];
  const coursesList = JSON.parse(localStorage.getItem("MASTER_COURSES")) || [];
  const attendanceLogs = JSON.parse(localStorage.getItem("DAILY_ATTENDANCE")) || [];

  let profile = studentsList.find(s => s[0] == loggedStudentID);
  if (!profile) return;

  let classRecord = classesList.find(c => c[0] == profile[2]);
  let courseRecord = coursesList.find(co => co[0] == profile[3]);

  document.getElementById("p-student-id").innerText = profile[0];
  document.getElementById("p-student-name").innerText = profile[1];
  document.getElementById("p-class-name").innerText = classRecord ? classRecord[1] : profile[2];
  document.getElementById("p-course-name").innerText = courseRecord ? courseRecord[1] : profile[3];
  document.getElementById("p-status").innerText = profile[4] || "Active";
  document.getElementById("p-dob").innerText = profile[5];
  document.getElementById("p-age").innerText = profile[6];
  document.getElementById("p-primary").innerText = profile[7];
  document.getElementById("p-secondary").innerText = profile[8] || "-";
  document.getElementById("p-marks").innerText = `10th: ${profile[9]}% | 12th: ${profile[10]}%`;
  
  let accomText = profile[11];
  if(accomText === "Hostel") accomText += ` (${profile[12]} - Room ${profile[13]})`;
  document.getElementById("p-accommodation").innerText = accomText;
  document.getElementById("p-address").innerText = profile[14];

  const photoFrame = document.getElementById("p-student-photo-frame");
  if (photoFrame && profile[15]) {
    photoFrame.innerHTML = `<img src="${profile[15]}" alt="Profile Photo" style="width:100%; height:100%; object-fit:cover;">`;
  } else if (photoFrame) {
    photoFrame.innerHTML = `<i class="fas fa-user-graduate"></i>`;
  }

  const studentAttLogs = attendanceLogs.filter(log => log[3] == loggedStudentID);
  const totalSlots = studentAttLogs.length;
  const presentSlots = studentAttLogs.filter(log => log[4] === "PRESENT").length;
  const percentageValue = totalSlots > 0 ? ((presentSlots / totalSlots) * 100).toFixed(1) : "100.0";

  document.getElementById("p-total-days").innerText = totalSlots;
  document.getElementById("p-present-days").innerText = presentSlots;
  document.getElementById("p-absent-days").innerText = totalSlots - presentSlots;
  document.getElementById("p-percentage").innerText = percentageValue + "%";

  const attHistoryBody = document.getElementById("student-att-history-tbody");
  if (attHistoryBody) {
    attHistoryBody.innerHTML = "";
    if (studentAttLogs.length === 0) {
      attHistoryBody.innerHTML = "<tr><td colspan='4' style='text-align: center; color: var(--slate-400);'>No logs.</td></tr>";
      return;
    }
    studentAttLogs.sort((a,b) => new Date(b[0]) - new Date(a[0]));
    studentAttLogs.forEach(log => {
      attHistoryBody.insertAdjacentHTML('beforeend', `<tr><td><strong>${log[0]}</strong></td><td>${log[1]}</td><td><span style="font-weight:700; color:${log[4]==='PRESENT'?'#166534':'#991b1b'}">${log[4]}</span></td><td>${log[5]}</td></tr>`);
    });
  }
}

function handleAttendanceCategoryToggle() {}

function filterSubjectsForMarksEntry() {
  const classId = document.getElementById("marks-class-select").value;
  const subjectSelect = document.getElementById("marks-subject-select");
  if (!subjectSelect) return;
  subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';

  if (!classId) return;

  const subjectList = JSON.parse(localStorage.getItem("MASTER_SUBJECTS")) || [];
  const allocationsList = JSON.parse(localStorage.getItem("MASTER_ALLOCATIONS")) || [];
  
  let assignedSubjects = [];
  if (activeUserSession.role === "ADMIN") {
    assignedSubjects = subjectList;
  } else {
    const staffName = activeUserSession.name;
    const codes = allocationsList
      .filter(row => row[1] === classId && row[0] === staffName)
      .map(row => row[2]);
    assignedSubjects = subjectList.filter(s => codes.includes(s[0]));
  }

  assignedSubjects.forEach(sub => {
    let opt = document.createElement("option");
    opt.value = sub[0];
    opt.text = `${sub[0]} - ${sub[1]}`;
    subjectSelect.appendChild(opt);
  });
}

function loadMarksEntrySheet() {
  const classId = document.getElementById("marks-class-select").value;
  const subjectCode = document.getElementById("marks-subject-select").value;
  const container = document.getElementById("marks-entry-container");

  if (!classId || !subjectCode) {
    alert("Please select both Class and Subject!");
    return;
  }

  const studentsList = JSON.parse(localStorage.getItem("MASTER_STUDENTS")) || [];
  const marksLogs = JSON.parse(localStorage.getItem("STUDENT_MARKS")) || [];
  const classStudents = studentsList.filter(s => s[2] === classId);

  if (classStudents.length === 0) {
    container.innerHTML = "<p style='padding: 15px;'>No student profiles registered in this class sector.</p>";
    return;
  }

  let html = `
    <table class="att-list-table">
      <thead>
        <tr>
          <th>Roll No</th>
          <th>Student Name</th>
          <th>CIA 1 (50)</th>
          <th>CIA 2 (50)</th>
          <th>CIA 3 (50)</th>
          <th>Assignment (5)</th>
          <th>Attendance (5)</th>
          <th>Semester (100)</th>
          <th>Grand Total (100)</th>
        </tr>
      </thead>
      <tbody>
  `;

  classStudents.forEach(student => {
    let existingRecord = marksLogs.find(m => m[0] === student[0] && m[1] === subjectCode);
    
    let cia1 = existingRecord ? existingRecord[2] : "0";
    let cia2 = existingRecord ? existingRecord[3] : "0";
    let cia3 = existingRecord ? existingRecord[4] : "0";
    let assign = existingRecord ? existingRecord[5] : "0";
    let att = existingRecord ? existingRecord[6] : "0";
    let sem = existingRecord ? existingRecord[7] : "0";
    let total = existingRecord ? existingRecord[8] : "0.0";

    html += `
      <tr data-student-id="${student[0]}">
        <td><strong>${student[0]}</strong></td>
        <td>${student[1]}</td>
        <td><input type="number" class="marks-input style-box" style="width:65px; padding:6px;" min="0" max="50" value="${cia1}" oninput="calculateRowMarkRuntime(this)"></td>
        <td><input type="number" class="marks-input style-box" style="width:65px; padding:6px;" min="0" max="50" value="${cia2}" oninput="calculateRowMarkRuntime(this)"></td>
        <td><input type="number" class="marks-input style-box" style="width:65px; padding:6px;" min="0" max="50" value="${cia3}" oninput="calculateRowMarkRuntime(this)"></td>
        <td><input type="number" class="marks-input style-box" style="width:65px; padding:6px;" min="0" max="5" value="${assign}" oninput="calculateRowMarkRuntime(this)"></td>
        <td><input type="number" class="marks-input style-box" style="width:65px; padding:6px;" min="0" max="5" value="${att}" oninput="calculateRowMarkRuntime(this)"></td>
        <td><input type="number" class="marks-input style-box" style="width:65px; padding:6px;" min="0" max="100" value="${sem}" oninput="calculateRowMarkRuntime(this)"></td>
        <td style="font-weight:700; color:var(--sky-600);" class="row-grand-total">${total}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function calculateRowMarkRuntime(inputNode) {
  const row = inputNode.closest("tr");
  const inputs = row.querySelectorAll(".marks-input");
  
  let cia1 = parseFloat(inputs[0].value) || 0;
  let cia2 = parseFloat(inputs[1].value) || 0;
  let cia3 = parseFloat(inputs[2].value) || 0;
  let assignment = parseFloat(inputs[3].value) || 0;
  let attendance = parseFloat(inputs[4].value) || 0;
  let semester = parseFloat(inputs[5].value) || 0;

  let ciaArr = [cia1, cia2, cia3].sort((a, b) => b - a);
  let bestOfTwoTotal = ciaArr[0] + ciaArr[1]; 
  
  let scaledCia = (bestOfTwoTotal / 100) * 40;
  let scaledSemester = (semester / 100) * 50;
  let grandTotal = scaledCia + assignment + attendance + scaledSemester;

  row.querySelector(".row-grand-total").innerText = grandTotal.toFixed(1);
}

async function saveStudentsMarksRegister() {
  const subjectCode = document.getElementById("marks-subject-select").value;
  const container = document.getElementById("marks-entry-container");
  const rows = container.querySelectorAll("tbody tr");

  if (!subjectCode || rows.length === 0) {
    alert("No active marks sheet generated or populated to save!");
    return;
  }

  let marksLogs = JSON.parse(localStorage.getItem("STUDENT_MARKS")) || [];
  setGlobalSyncState(true);

  for (let row of rows) {
    let studentId = row.getAttribute("data-student-id");
    const inputs = row.querySelectorAll(".marks-input");
    
    let cia1 = inputs[0].value || "0";
    let cia2 = inputs[1].value || "0";
    let cia3 = inputs[2].value || "0";
    let assign = inputs[3].value || "0";
    let att = inputs[4].value || "0";
    let sem = inputs[5].value || "0";
    let total = row.querySelector(".row-grand-total").innerText;

    let matchIdx = marksLogs.findIndex(m => m[0] === studentId && m[1] === subjectCode);
    let payload = [studentId, subjectCode, cia1, cia2, cia3, assign, att, sem, total];
    
    let recordId = matchIdx > -1 ? marksLogs[matchIdx][marksLogs[matchIdx].length - 1] : "REC-MRK-" + Date.now() + "-" + Math.floor(Math.random()*1000);
    payload.push(recordId);

    if (matchIdx > -1) {
      marksLogs[matchIdx] = payload;
      await syncWithGoogleSheet("Student_Marks", payload, SYSTEM_SCHEMA["STUDENT_MARKS"], "UPDATE", recordId);
    } else {
      marksLogs.push(payload);
      await syncWithGoogleSheet("Student_Marks", payload, SYSTEM_SCHEMA["STUDENT_MARKS"], "CREATE");
    }
  }

  localStorage.setItem("STUDENT_MARKS", JSON.stringify(marksLogs));
  setGlobalSyncState(false);
  alert("Success: Student marks successfully computed and synchronized!");
}

function handleUniversalDelete(tblKey, rowIdx) {
  if (!confirm("Are you sure you want to permanently delete this record?")) return;
  let valuesMatrix = JSON.parse(localStorage.getItem(tblKey)) || [];
  let targetRowData = valuesMatrix[rowIdx];
  let recordId = targetRowData[targetRowData.length - 1];

  let targetTab = sheetTabForKey(tblKey, targetRowData);
  if (targetTab) syncWithGoogleSheet(targetTab, [], [], "DELETE", recordId);

  valuesMatrix.splice(rowIdx, 1);
  localStorage.setItem(tblKey, JSON.stringify(valuesMatrix));
  renderAllTables();
}
