
// ==========================================
// CAMPUSCONNECT - COMPLETE JAVASCRIPT
// ==========================================

const $ = id => document.getElementById(id);

let user = null;
let mode = "login";
let currentQuiz = null;
let selectedAnswer = [];

const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  },

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

function uid() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
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

// ==========================================
// LOGIN AND REGISTRATION
// ==========================================

function setMode(nextMode) {
  mode = nextMode;

  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");
  $("nameField").classList.toggle("hidden", mode === "login");
  $("roleField").classList.toggle("hidden", mode === "login");
  $("name").required = mode === "register";
  $("authSubmit").textContent =
    mode === "login" ? "Login" : "Create account";

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
  if (typeof supabaseClient !== "undefined" && supabaseClient) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role } }
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
  if (typeof supabaseClient !== "undefined" && supabaseClient) {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({ email, password });

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
  if (typeof supabaseClient !== "undefined" && supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  user = null;
  currentQuiz = null;
  selectedAnswer = [];

  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
  $("authForm").reset();

  setMode("login");
}

$("logout").addEventListener("click", () => {
  logout().catch(error => notice("authMsg", error.message, true));
});

// ==========================================
// NAVIGATION
// ==========================================

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

// ==========================================
// PROFILE
// ==========================================

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

  if (!(typeof supabaseClient !== "undefined" && supabaseClient)) {
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

// ==========================================
// PARTNER FINDER
// ==========================================

function seedDemoProfiles() {
  if (store.get("cc_demo_seeded").length) return;

  const demoProfiles = [
    {
      userId: "demo_aarav",
      name: "Aarav Mehta",
      branch: "CSE",
      year: "2nd Year",
      role: "Frontend Developer",
      skills: ["JavaScript", "React", "UI/UX"],
      interests: ["Web apps"],
      bio: "I enjoy creating clean web interfaces."
    },
    {
      userId: "demo_mira",
      name: "Mira Shah",
      branch: "CSE - AI/ML",
      year: "3rd Year",
      role: "Data Analyst",
      skills: ["Python", "SQL", "Data Science"],
      interests: ["AI", "Analytics"],
      bio: "Looking for teammates for a data project."
    }
  ];

  store.set("cc_profiles", [
    ...store.get("cc_profiles"),
    ...demoProfiles
  ]);

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
    (!query || [
      p.name, p.branch, p.role, p.bio,
      ...(p.skills || []), ...(p.interests || [])
    ].join(" ").toLowerCase().includes(query)) &&
    (!skill || (p.skills || []).some(s => s.toLowerCase() === skill)) &&
    (!year || p.year === year)
  );

  $("people").innerHTML = "";

  if (!people.length) {
    $("people").innerHTML =
      '<div class="card empty">No matching profiles found.</div>';
    return;
  }

  people.forEach(p => {
    const article = document.createElement("article");
    article.className = "item";

    article.innerHTML = `
      <h3>${escapeHTML(p.name)}</h3>
      <p class="muted">${escapeHTML(p.branch || "Student")} · ${escapeHTML(p.year || "")}</p>
      <p>${escapeHTML(p.role || "Student")}</p>
      <div>${(p.skills || []).map(s =>
        `<span class="tag">${escapeHTML(s)}</span>`
      ).join("")}</div>
      <p>${escapeHTML(p.bio || "No introduction added.")}</p>
      <p class="small">Interests: ${escapeHTML((p.interests || []).join(", "))}</p>
      <button class="secondary" type="button">View contact details</button>
    `;

    article.querySelector("button").addEventListener("click", () => {
      alert("Student: " + p.name + "\nEmail: " +
        (p.email || "Demo profile — no contact email"));
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

// ==========================================
// PROJECT BOARD
// ==========================================

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
    !query || [
      p.title, p.description, p.ownerName, ...(p.skills || [])
    ].join(" ").toLowerCase().includes(query)
  );

  $("projectList").innerHTML = "";

  if (!projects.length) {
    $("projectList").innerHTML =
      '<div class="card empty">No projects yet. Create the first one!</div>';
    return;
  }

  projects.forEach(p => {
    const article = document.createElement("article");
    article.className = "item";

    article.innerHTML = `
      <h3>${escapeHTML(p.title)}</h3>
      <p class="muted">Posted by ${escapeHTML(p.ownerName)}</p>
      <p>${escapeHTML(p.description)}</p>
      <div>${(p.skills || []).map(s =>
        `<span class="tag">${escapeHTML(s)}</span>`
      ).join("")}</div>
      <p class="small">${p.ownerId === user.id ? "Your project" : "Project opportunity"}</p>
    `;

    $("projectList").appendChild(article);
  });
}

$("projectSearch").addEventListener("input", renderProjects);

// ==========================================
// QUIZZES: MULTIPLE QUESTIONS
// ==========================================

function setupQuiz() {
  const isTeacher = user.role === "teacher";

  $("teacherQuiz").classList.toggle("hidden", !isTeacher);
  $("studentQuiz").classList.toggle("hidden", isTeacher);

  if (isTeacher) {
    if (!$("questionContainer").children.length) {
      addQuestion();
    }

    renderMyQuizzes();
  } else {
    renderQuizResults();
  }
}

function addQuestion() {
  const container = $("questionContainer");
  const number = container.children.length + 1;

  const card = document.createElement("div");
  card.className = "question-card";

  card.innerHTML = `
    <div class="row">
      <h3 class="question-heading">Question ${number}</h3>
      <button class="danger removeQuestion" type="button">Remove</button>
    </div>

    <label>Question</label>
    <textarea class="questionText" required
      placeholder="Enter your question"></textarea>

    <div class="form-grid">
      <div>
        <label>Option 1</label>
        <input class="questionOption" required placeholder="Option 1">
      </div>
      <div>
        <label>Option 2</label>
        <input class="questionOption" required placeholder="Option 2">
      </div>
      <div>
        <label>Option 3</label>
        <input class="questionOption" required placeholder="Option 3">
      </div>
      <div>
        <label>Option 4</label>
        <input class="questionOption" required placeholder="Option 4">
      </div>
    </div>

    <label>Correct option</label>
    <select class="questionAnswer">
      <option value="0">Option 1</option>
      <option value="1">Option 2</option>
      <option value="2">Option 3</option>
      <option value="3">Option 4</option>
    </select>
  `;

  card.querySelector(".removeQuestion").addEventListener("click", () => {
    if (container.children.length <= 1) {
      notice("quizMsg", "A quiz must have at least one question.", true);
      return;
    }

    card.remove();
    renumberQuestions();
  });

  container.appendChild(card);
  renumberQuestions();
}

function renumberQuestions() {
  document.querySelectorAll("#questionContainer .question-heading")
    .forEach((heading, index) => {
      heading.textContent = "Question " + (index + 1);
    });
}

$("addQuestion").addEventListener("click", () => {
  addQuestion();
  notice("quizMsg", "");
});

$("quizForm").addEventListener("submit", event => {
  event.preventDefault();

  const cards = [
    ...document.querySelectorAll("#questionContainer .question-card")
  ];

  if (!cards.length) {
    notice("quizMsg", "Please add at least one question.", true);
    return;
  }

  const questions = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const question = card.querySelector(".questionText").value.trim();

    const options = [
      ...card.querySelectorAll(".questionOption")
    ].map(input => input.value.trim());

    const answer = Number(card.querySelector(".questionAnswer").value);

    if (!question || options.some(option => !option)) {
      notice("quizMsg",
        `Please complete Question ${i + 1} and its four options.`,
        true);
      return;
    }

    if (new Set(options.map(option => option.toLowerCase())).size !== 4) {
      notice("quizMsg",
        `Question ${i + 1} must have four different options.`,
        true);
      return;
    }

    questions.push({ question, options, answer });
  }

  const quiz = {
    id: uid(),
    ownerId: user.id,
    title: $("quizTitle").value.trim(),
    code: "QZ-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    questions,

    // Compatibility with older single-question quizzes
    question: questions[0].question,
    options: questions[0].options,
    answer: questions[0].answer
  };

  const quizzes = store.get("cc_quizzes");
  quizzes.unshift(quiz);
  store.set("cc_quizzes", quizzes);

  const code = quiz.code;

  $("quizForm").reset();
  $("questionContainer").innerHTML = "";
  addQuestion();

  notice("quizMsg",
    `Quiz published successfully!\nQuestions: ${questions.length}\nQuiz code: ${code}`);

  renderMyQuizzes();
  updateStats();
});

function getQuizQuestions(quiz) {
  if (Array.isArray(quiz.questions) && quiz.questions.length) {
    return quiz.questions;
  }

  // Allow previously created single-question quizzes to work.
  return [{
    question: quiz.question,
    options: quiz.options || [],
    answer: Number(quiz.answer)
  }];
}

function renderMyQuizzes() {
  const quizzes = store.get("cc_quizzes")
    .filter(q => q.ownerId === user.id);

  $("myQuizzes").innerHTML = "";

  if (!quizzes.length) {
    $("myQuizzes").innerHTML =
      '<p class="muted">You have not published a quiz yet.</p>';
    return;
  }

  quizzes.forEach(quiz => {
    const article = document.createElement("article");
    article.className = "item";

    article.innerHTML = `
      <h3>${escapeHTML(quiz.title)}</h3>
      <p>Quiz code: <strong>${escapeHTML(quiz.code)}</strong></p>
      <p class="muted">${getQuizQuestions(quiz).length} question(s)</p>
    `;

    $("myQuizzes").appendChild(article);
  });
}

// ==========================================
// STUDENT QUIZ ATTEMPT
// ==========================================

$("joinQuiz").addEventListener("submit", event => {
  event.preventDefault();

  const code = $("quizCode").value.trim().toUpperCase();

  const quiz = store.get("cc_quizzes")
    .find(q => q.code === code);

  if (!quiz) {
    $("quizAttempt").innerHTML =
      '<p class="message error">Quiz not found. Check the code.</p>';
    return;
  }

  if (quiz.ownerId === user.id) {
    $("quizAttempt").innerHTML =
      '<p class="message">This is your own quiz. Log in as a student to attempt it.</p>';
    return;
  }

  currentQuiz = quiz;
  selectedAnswer = [];

  const questions = getQuizQuestions(quiz);
  const wrapper = document.createElement("div");
  wrapper.className = "item";

  const title = document.createElement("h2");
  title.textContent = quiz.title;
  wrapper.appendChild(title);

  const instructions = document.createElement("p");
  instructions.className = "muted";
  instructions.textContent =
    "Answer every question, then submit your quiz.";
  wrapper.appendChild(instructions);

  questions.forEach((question, questionIndex) => {
    const questionCard = document.createElement("div");
    questionCard.className = "question-card";

    const heading = document.createElement("h3");
    heading.textContent = `Question ${questionIndex + 1}`;
    questionCard.appendChild(heading);

    const questionText = document.createElement("p");
    questionText.textContent = question.question;
    questionCard.appendChild(questionText);

    question.options.forEach((option, optionIndex) => {
      const label = document.createElement("label");
      label.className = "answer-label";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "quizQuestion" + questionIndex;
      radio.value = optionIndex;

      radio.addEventListener("change", () => {
        selectedAnswer[questionIndex] = optionIndex;
      });

      label.appendChild(radio);
      label.appendChild(document.createTextNode(option));
      questionCard.appendChild(label);
    });

    wrapper.appendChild(questionCard);
  });

  const submitButton = document.createElement("button");
  submitButton.id = "submitAnswer";
  submitButton.className = "primary";
  submitButton.type = "button";
  submitButton.textContent = "Submit quiz";

  const message = document.createElement("p");
  message.id = "answerMsg";
  message.className = "message";

  wrapper.appendChild(submitButton);
  wrapper.appendChild(message);

  $("quizAttempt").replaceChildren(wrapper);

  submitButton.addEventListener("click", submitAnswer);
});

function submitAnswer() {
  if (!currentQuiz) return;

  const questions = getQuizQuestions(currentQuiz);

  if (questions.some((question, index) =>
    selectedAnswer[index] === undefined
  )) {
    notice("answerMsg",
      "Please answer every question before submitting.", true);
    return;
  }

  let score = 0;

  questions.forEach((question, index) => {
    if (selectedAnswer[index] === Number(question.answer)) {
      score++;
    }
  });

  const results = store.get("cc_results");

  results.unshift({
    id: uid(),
    studentId: user.id,
    quizId: currentQuiz.id,
    title: currentQuiz.title,
    score,
    total: questions.length,
    date: new Date().toISOString()
  });

  store.set("cc_results", results);

  const submittedQuiz = currentQuiz;
  currentQuiz = null;
  selectedAnswer = [];

  const resultCard = document.createElement("div");
  resultCard.className = "item";

  const heading = document.createElement("h2");
  heading.textContent = "Quiz submitted!";
  resultCard.appendChild(heading);

  const scoreText = document.createElement("p");
  scoreText.textContent =
    `Your score: ${score}/${questions.length}`;
  resultCard.appendChild(scoreText);

  const feedback = document.createElement("p");
  feedback.className = "muted";
  feedback.textContent =
    `You answered ${score} out of ${questions.length} correctly.`;
  resultCard.appendChild(feedback);

  $("quizAttempt").replaceChildren(resultCard);
  renderQuizResults();
}

function renderQuizResults() {
  const results = store.get("cc_results")
    .filter(r => r.studentId === user.id);

  $("quizResults").innerHTML = "";

  if (!results.length) {
    $("quizResults").innerHTML =
      '<p class="muted">No quiz results yet.</p>';
    return;
  }

  results.forEach(result => {
    const article = document.createElement("article");
    article.className = "item";

    article.innerHTML = `
      <strong>${escapeHTML(result.title)}</strong>
      <p>Score: ${Number(result.score)}/${Number(result.total)}</p>
    `;

    $("quizResults").appendChild(article);
  });
}

// ==========================================
// DASHBOARD COUNTS
// ==========================================

function updateStats() {
  if (!user) return;

  $("statQuiz").textContent = store.get("cc_quizzes")
    .filter(q => q.ownerId === user.id).length;

  $("statProject").textContent = store.get("cc_projects")
    .filter(p => p.ownerId === user.id).length;
}

// ==========================================
// RESTORE SUPABASE SESSION IF CONFIGURED
// ==========================================

async function restoreSession() {
  if (typeof supabaseClient === "undefined" || !supabaseClient) {
    return;
  }

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
