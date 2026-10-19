
const $ = id => document.getElementById(id);

let user = null;
let mode = "login";
let currentQuiz = null;
let selectedAnswer = null;

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function tags(value) {
  return value.split(",").map(x => x.trim()).filter(Boolean);
}

function notice(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function setMode(nextMode) {
  mode = nextMode;
  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");
  $("nameField").classList.toggle("hidden", mode === "login");
  $("roleField").classList.toggle("hidden", mode === "login");
  $("name").required = mode === "register";
  $("authSubmit").textContent = mode === "login" ? "Login" : "Create account";
  notice("authMsg", "");
}

$("loginTab").addEventListener("click", () => setMode("login"));
$("registerTab").addEventListener("click", () => setMode("register"));

function getLocalUsers() {
  return store.get("cc_users");
}

function saveLocalUser(account) {
  const accounts = getLocalUsers();
  const index = accounts.findIndex(a => a.id === account.id);
  if (index < 0) accounts.push(account);
  else accounts[index] = account;
  store.set("cc_users", accounts);
}

function saveProfile(profile) {
  const profiles = store.get("cc_profiles");
  const index = profiles.findIndex(p => p.userId === profile.userId);
  if (index < 0) profiles.push(profile);
  else profiles[index] = profile;
  store.set("cc_profiles", profiles);
}

function getProfile(userId) {
  return store.get("cc_profiles").find(p => p.userId === userId);
}

function defaultProfile(account) {
  return {
    userId: account.id,
    name: account.name,
    email: account.email || "",
    branch: "",
    year: "1st Year",
    role: "Developer",
    skills: [],
    interests: [],
    bio: ""
  };
}

async function signUp(email, password, name, role) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, role }
      }
    });

    if (error) throw error;

    if (data.user) {
      user = {
        id: data.user.id,
        name,
        email,
        role
      };
      saveProfile(defaultProfile(user));

      if (data.session) {
        openApp();
        return "Account created successfully!";
      }

      return "Account created. Check your email to confirm your account, then log in.";
    }
  }

  const accounts = getLocalUsers();
  if (accounts.some(a => a.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("An account with this email already exists.");
  }

  user = { id: uid(), name, email, role };
  saveLocalUser({ ...user, password });
  saveProfile(defaultProfile(user));
  openApp();
  return "Account created successfully!";
}

async function signIn(email, password) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const metadata = data.user.user_metadata || {};
    user = {
      id: data.user.id,
      name: metadata.full_name || email.split("@")[0],
      email,
      role: metadata.role || "student"
    };

    openApp();
    return;
  }

  const account = getLocalUsers().find(a =>
    a.email.toLowerCase() === email.toLowerCase() &&
    a.password === password
  );

  if (!account) {
    throw new Error("Account not found. Create an account first.");
  }

  user = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role
  };

  openApp();
}

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = $("authSubmit");
  submitButton.disabled = true;
  notice("authMsg", "Please wait...");

  try {
    const email = $("email").value.trim().toLowerCase();
    const password = $("password").value;

    if (mode === "register") {
      const name = $("name").value.trim();
      if (!name) throw new Error("Please enter your name.");

      const message = await signUp(
        email, password, name, $("role").value
      );

      notice("authMsg", message);
    } else {
      await signIn(email, password);
    }
  } catch (error) {
    notice("authMsg", error.message || "Something went wrong.", true);
  } finally {
    submitButton.disabled = false;
  }
});

function openApp() {
  if (!user) return;

  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userLabel").textContent = user.name + " · " + user.role;
  $("welcome").textContent = "Welcome, " + user.name + "!";
  showPage("dashboard");
  loadProfile();
  updateStats();
}

async function logout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  user = null;
  currentQuiz = null;
  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
  $("authForm").reset();
  setMode("login");
}

$("logout").addEventListener("click", () => {
  logout().catch(error => notice("authMsg", error.message, true));
});

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("hidden", section.id !== page);
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (!user) return;

  if (page === "partners") renderPeople();
  if (page === "projects") renderProjects();
  if (page === "quiz") setupQuiz();
  if (page === "profile") loadProfile();
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

// Profile
function loadProfile() {
  if (!user) return;

  const p = getProfile(user.id) || defaultProfile(user);
  $("pName").value = p.name || user.name;
  $("branch").value = p.branch || "";
  $("year").value = p.year || "1st Year";
  $("preferredRole").value = p.role || "Developer";
  $("skills").value = (p.skills || []).join(", ");
  $("interests").value = (p.interests || []).join(", ");
  $("bio").value = p.bio || "";
}

$("profileForm").addEventListener("submit", event => {
  event.preventDefault();

  const p = {
    userId: user.id,
    name: $("pName").value.trim(),
    email: user.email,
    branch: $("branch").value.trim(),
    year: $("year").value,
    role: $("preferredRole").value,
    skills: tags($("skills").value),
    interests: tags($("interests").value),
    bio: $("bio").value.trim()
  };

  saveProfile(p);
  user.name = p.name;

  if (!supabaseClient) {
    const account = getLocalUsers().find(a => a.id === user.id);
    if (account) {
      account.name = user.name;
      saveLocalUser(account);
    }
  }

  $("userLabel").textContent = user.name + " · " + user.role;
  $("welcome").textContent = "Welcome, " + user.name + "!";
  notice("profileMsg", "Profile saved.");
  renderPeople();
});

// Partner Finder
function seedDemoProfiles() {
  if (store.get("cc_demo_seeded").length) return;

  const demoProfiles = [
    {
      userId: "demo_aarav", name: "Aarav Mehta", branch: "CSE",
      year: "2nd Year", role: "Frontend Developer",
      skills: ["JavaScript", "React", "UI/UX"],
      interests: ["Web apps"], bio: "I enjoy creating clean web interfaces."
    },
    {
      userId: "demo_mira", name: "Mira Shah", branch: "CSE - AI/ML",
      year: "3rd Year", role: "Data Analyst",
      skills: ["Python", "SQL", "Data Science"],
      interests: ["AI", "Analytics"], bio: "Looking for teammates for a data project."
    }
  ];

  store.set("cc_profiles", [...store.get("cc_profiles"), ...demoProfiles]);
  store.set("cc_demo_seeded", ["yes"]);
}

function renderPeople() {
  if (!user) return;
  seedDemoProfiles();

  const query = $("studentSearch").value.toLowerCase().trim();
  const skill = $("skillFilter").value.toLowerCase();
  const year = $("yearFilter").value;

  const people = store.get("cc_profiles").filter(p =>
    p.userId !== user.id &&
    (!query || [p.name, p.branch, p.role, p.bio, ...(p.skills || []), ...(p.interests || [])]
      .join(" ").toLowerCase().includes(query)) &&
    (!skill || (p.skills || []).some(s => s.toLowerCase() === skill)) &&
    (!year || p.year === year)
  );

  $("people").innerHTML = "";

  if (!people.length) {
    $("people").innerHTML = '<div class="card empty">No matching profiles found.</div>';
    return;
  }

  people.forEach(p => {
    const article = document.createElement("article");
    article.className = "item";
    article.innerHTML = `
      <h3>${escapeHTML(p.name)}</h3>
      <p class="muted">${escapeHTML(p.branch || "Student")} · ${escapeHTML(p.year || "")}</p>
      <p>${escapeHTML(p.role || "Student")}</p>
      <div>${(p.skills || []).map(s => `<span class="tag">${escapeHTML(s)}</span>`).join("")}</div>
      <p>${escapeHTML(p.bio || "No introduction added.")}</p>
      <p class="small">Interests: ${escapeHTML((p.interests || []).join(", "))}</p>
      <button class="secondary" type="button">View contact details</button>
    `;

    article.querySelector("button").addEventListener("click", () => {
      const email = p.email || "Demo profile — no contact email";
      alert("Student: " + p.name + "\nEmail: " + email);
    });

    $("people").appendChild(article);
  });
}

["studentSearch", "skillFilter", "yearFilter"].forEach(id => {
  $(id).addEventListener(
    id === "studentSearch" ? "input" : "change",
    renderPeople
  );
});

// Projects
$("newProject").addEventListener("click", () => {
  $("projectModal").classList.remove("hidden");
});

$("closeProject").addEventListener("click", () => {
  $("projectModal").classList.add("hidden");
});

$("projectForm").addEventListener("submit", event => {
  event.preventDefault();

  const projects = store.get("cc_projects");
  projects.unshift({
    id: uid(),
    ownerId: user.id,
    ownerName: user.name,
    title: $("projectTitle").value.trim(),
    description: $("projectDescription").value.trim(),
    skills: tags($("projectSkills").value),
    date: new Date().toISOString()
  });

  store.set("cc_projects", projects);
  $("projectForm").reset();
  $("projectModal").classList.add("hidden");
  renderProjects();
  updateStats();
});

function renderProjects() {
  if (!user) return;

  const query = $("projectSearch").value.toLowerCase().trim();
  const projects = store.get("cc_projects").filter(p =>
    !query || [p.title, p.description, p.ownerName, ...(p.skills || [])]
      .join(" ").toLowerCase().includes(query)
  );

  $("projectList").innerHTML = "";

  if (!projects.length) {
    $("projectList").innerHTML = '<div class="card empty">No projects yet. Create the first one!</div>';
    return;
  }

  projects.forEach(p => {
    const article = document.createElement("article");
    article.className = "item";

    article.innerHTML = `
      <h3>${escapeHTML(p.title)}</h3>
      <p class="muted">Posted by ${escapeHTML(p.ownerName)}</p>
      <p>${escapeHTML(p.description)}</p>
      <div>${(p.skills || []).map(s => `<span class="tag">${escapeHTML(s)}</span>`).join("")}</div>
      <p class="small">${p.ownerId === user.id ? "Your project" : "Project opportunity"}</p>
    `;

    $("projectList").appendChild(article);
  });
}

$("projectSearch").addEventListener("input", renderProjects);

// Quizzes
function setupQuiz() {
  const isTeacher = user.role === "teacher";
  $("teacherQuiz").classList.toggle("hidden", !isTeacher);
  $("studentQuiz").classList.toggle("hidden", isTeacher);

  if (isTeacher) renderMyQuizzes();
  else renderQuizResults();
}

$("quizForm").addEventListener("submit", event => {
  event.preventDefault();

  const options = [0, 1, 2, 3].map(i => $("opt" + i).value.trim());

  if (new Set(options.map(x => x.toLowerCase())).size !== 4) {
    notice("quizMsg", "Please enter four different options.", true);
    return;
  }

  const quizzes = store.get("cc_quizzes");

  const quiz = {
    id: uid(),
    ownerId: user.id,
    title: $("quizTitle").value.trim(),
    code: "QZ-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    question: $("quizQuestion").value.trim(),
    options,
    answer: Number($("quizAnswer").value)
  };

  quizzes.unshift(quiz);
  store.set("cc_quizzes", quizzes);

  $("quizForm").reset();
  notice("quizMsg", "Quiz published! Share this code: " + quiz.code);
  renderMyQuizzes();
  updateStats();
});

function renderMyQuizzes() {
  const quizzes = store.get("cc_quizzes").filter(q => q.ownerId === user.id);
  $("myQuizzes").innerHTML = "";

  if (!quizzes.length) {
    $("myQuizzes").innerHTML = '<p class="muted">You have not published a quiz yet.</p>';
    return;
  }

  quizzes.forEach(q => {
    const article = document.createElement("article");
    article.className = "item";
    article.innerHTML = `<h3>${escapeHTML(q.title)}</h3><p>Quiz code: <strong>${escapeHTML(q.code)}</strong></p>`;
    $("myQuizzes").appendChild(article);
  });
}

$("joinQuiz").addEventListener("submit", event => {
  event.preventDefault();

  const code = $("quizCode").value.trim().toUpperCase();
  const quiz = store.get("cc_quizzes").find(q => q.code === code);

  if (!quiz) {
    $("quizAttempt").innerHTML = '<p class="message error">Quiz not found. Check the code.</p>';
    return;
  }

  if (quiz.ownerId === user.id) {
    $("quizAttempt").innerHTML = '<p class="message">This is your own quiz. Log in as a student to attempt it.</p>';
    return;
  }

  currentQuiz = quiz;
  selectedAnswer = null;

  $("quizAttempt").innerHTML = `
    <div class="item">
      <h3>${escapeHTML(quiz.title)}</h3>
      <p>${escapeHTML(quiz.question)}</p>
      <div id="answerOptions"></div>
      <button id="submitAnswer" class="primary" type="button">Submit answer</button>
      <p id="answerMsg" class="message"></p>
    </div>
  `;

  quiz.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.margin = "12px 0";
    label.innerHTML = `<input type="radio" name="quizOption" value="${index}" style="width:auto;margin:0 8px 0 0"> ${escapeHTML(option)}`;

    label.querySelector("input").addEventListener("change", () => {
      selectedAnswer = index;
    });

    $("answerOptions").appendChild(label);
  });

  $("submitAnswer").addEventListener("click", submitAnswer);
});

function submitAnswer() {
  if (selectedAnswer === null) {
    notice("answerMsg", "Select an answer first.", true);
    return;
  }

  const results = store.get("cc_results");
  const score = selectedAnswer === currentQuiz.answer ? 1 : 0;

  results.unshift({
    id: uid(),
    studentId: user.id,
    quizId: currentQuiz.id,
    title: currentQuiz.title,
    score,
    total: 1,
    date: new Date().toISOString()
  });

  store.set("cc_results", results);

  $("quizAttempt").innerHTML = `
    <div class="item">
      <h3>Quiz submitted!</h3>
      <p>Your score: <strong>${score}/1</strong></p>
    </div>
  `;

  renderQuizResults();
}

function renderQuizResults() {
  const results = store.get("cc_results").filter(r => r.studentId === user.id);
  $("quizResults").innerHTML = "";

  if (!results.length) {
    $("quizResults").innerHTML = '<p class="muted">No quiz results yet.</p>';
    return;
  }

  results.forEach(r => {
    const article = document.createElement("article");
    article.className = "item";
    article.innerHTML = `<strong>${escapeHTML(r.title)}</strong><p>Score: ${r.score}/${r.total}</p>`;
    $("quizResults").appendChild(article);
  });
}

function updateStats() {
  if (!user) return;

  $("statQuiz").textContent =
    store.get("cc_quizzes").filter(q => q.ownerId === user.id).length;

  $("statProject").textContent =
    store.get("cc_projects").filter(p => p.ownerId === user.id).length;
}

// Restore Supabase login session if available.
async function restoreSession() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) return;

  const authUser = data.session.user;
  const metadata = authUser.user_metadata || {};

  user = {
    id: authUser.id,
    name: metadata.full_name || authUser.email.split("@")[0],
    email: authUser.email,
    role: metadata.role || "student"
  };

  openApp();
}

setMode("login");
restoreSession().catch(error => console.error("Session restore:", error));
