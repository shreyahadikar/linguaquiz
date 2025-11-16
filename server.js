// server.js — LangLink+ Backend

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["https://linguaquiz12.netlify.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.static('frontend'));

const JWT_SECRET = process.env.JWT_SECRET || 'langlink_demo_secret_please_change';

// ===============================
// MySQL Connection
// ===============================
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: { rejectUnauthorized: false }
};

let db;
(async function connectDB() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL');
  } catch (err) {
    console.error('❌ MySQL connection failed:', err);
  }
})();

const LANG_COLUMN_MAP = {
  Spanish: 'progress_spanish',
  French: 'progress_french',
  Hindi: 'progress_hindi',
  Kannada: 'progress_kannada',
  Tamil: 'progress_tamil',
  Telugu: 'progress_telugu',
  Marathi: 'progress_marathi',
  Malayalam: 'progress_malayalam',
  Bhojpuri: 'progress_bhojpuri',
  Rajasthani: 'progress_rajasthani',
  Punjabi: 'progress_punjabi',
  Kashmiri: 'progress_kashmiri',
  Urdu: 'progress_urdu',
  Korean: 'progress_korean'
};

function getProgressColumn(lang) {
  return LANG_COLUMN_MAP[lang] || null;
}
// ===============================
// API ROUTES
// ===============================

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, learning_lang } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    // Check existing user
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'User already exists. Please login instead.' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);
    const lang = learning_lang || 'Spanish';

    // Insert user
    await db.execute(
      'INSERT INTO users (name, email, password, learning_lang, score, level, xp) VALUES (?, ?, ?, ?, 0, "Beginner", 0)',
      [name, email, hash, lang]
    );

    return res.json({
      message: 'User registered successfully!'
    });

  } catch (err) {
    console.error('Error registering user:', err);
    return res.status(500).json({ message: 'Registration error' });
  }
});



// -------------------------
// LOGIN ROUTE
// -------------------------
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    const [rows] = await db.execute(
      'SELECT id, name, email, password FROM users WHERE email = ?',
      [email]
    );

    if (!rows.length)
      return res.status(404).json({ message: 'User not found' });

    const user = rows[0];

    // Compare password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ message: 'Invalid password' });

    const token = jwt.sign(
      { email: user.email, id: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: { name: user.name, email: user.email }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Login failed' });
  }
});


// -------------------------
// OPTIONAL AUTH MIDDLEWARE
// -------------------------
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) return res.status(401).json({ message: 'Authorization header missing' });

  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}


// Get dashboard info
// ===============================
// Dashboard (return full user overview incl. progress columns)
// ===============================
app.get('/api/dashboard/:email', async (req, res) => {
  const email = req.params.email;
  try {
    // Select all progress columns explicitly
    const cols = [
      'id','name','email','learning_lang','level','xp','streak','last_active',
      'progress_spanish','progress_french','progress_hindi','progress_kannada',
      'progress_tamil','progress_telugu','progress_marathi','progress_malayalam',
      'progress_bhojpuri','progress_rajasthani','progress_punjabi','progress_kashmiri',
      'progress_urdu'
    ].join(',');

    const [rows] = await db.execute(`SELECT ${cols} FROM users WHERE email = ?`, [email]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    return res.status(500).json({ message: 'Error fetching dashboard data' });
  }
});


// ===============================
// Update Daily Streak
// ===============================
app.post('/api/update-streak', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email required' });

  try {
    const [rows] = await db.execute('SELECT last_active, streak FROM users WHERE email = ?', [email]);

    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const lastActive = rows[0].last_active;
    const currentStreak = rows[0].streak || 0;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let newStreak = currentStreak;

   if (!lastActive) newStreak = 1;
    else {
      const last = new Date(lastActive);
      if (last.toDateString() === yesterday.toDateString()) newStreak = currentStreak + 1;
      else if (last.toDateString() !== today.toDateString()) newStreak = 1;
    }

    await db.execute('UPDATE users SET streak = ?, last_active = CURDATE() WHERE email = ?', [newStreak, email]);
    return res.json({ message: 'Streak updated successfully', streak: newStreak });
  } catch (err) {
    console.error('Error updating streak:', err);
    return res.status(500).json({ message: 'Server error while updating streak' });
  }
});

// Get quiz questions for a language
// Get quiz questions by language
app.get('/api/questions/:lang', async (req, res) => {
  const lang = req.params.lang;

  // Example Spanish questions
 if(lang === "Spanish") {
  return res.json([
    {
      question: "What is the Spanish word for 'Apple'?",
      options: ["Manzana", "Pera", "Banana", "Uva"],
      answer: "Manzana",
      hint: "🍎 Starts with M and sounds like ‘man-zah-na’."
    },
    {
      question: "How do you say 'Thank you' in Spanish?",
      options: ["Hola", "Gracias", "Adiós", "Por favor"],
      answer: "Gracias",
      hint: "🙏 Used to thank someone politely."
    },
    {
      question: "How do you say 'Good morning' in Spanish?",
      options: ["Buenas noches", "Buenos días", "Buenas tardes", "Hola"],
      answer: "Buenos días",
      hint: "☀️ Literally means ‘good days’."
    },
    {
      question: "What is 'Hello' in Spanish?",
      options: ["Hola", "Bonjour", "Ciao", "Hallo"],
      answer: "Hola",
      hint: "💡 It starts with an H but sounds like 'Ola'."
    }
  ]);
}

if(lang === "French") {
  return res.json([
    {
      question: "What is the French word for 'Apple'?",
      options: ["Pomme", "Banane", "Orange", "Raisin"],
      answer: "Pomme",
      hint: "🍎 Pronounced like 'pom'."
    },
    {
      question: "How do you say 'Thank you' in French?",
      options: ["Bonjour", "Merci", "Au revoir", "S'il vous plaît"],
      answer: "Merci",
      hint: "🙏 Commonly used to say thanks."
    },
    {
      question: "How do you say 'Good morning' in French?",
      options: ["Bonsoir", "Bonjour", "Bonne nuit", "Salut"],
      answer: "Bonjour",
      hint: "☀️ Means ‘Good day’ — used in the morning."
    }
  ]);
}

if(lang === "Hindi") {
  return res.json([
    {
      question: "What is the Hindi word for 'Apple'?",
      options: ["सेब", "केला", "आम", "अंगूर"],
      answer: "सेब",
      hint: "🍎 Simple word, similar to English ‘seb’."
    },
    {
      question: "How do you say 'Thank you' in Hindi?",
      options: ["नमस्ते", "धन्यवाद", "अलविदा", "कृपया"],
      answer: "धन्यवाद",
      hint: "🙏 Used when expressing gratitude."
    },
    {
      question: "How do you say 'Good morning' in Hindi?",
      options: ["शुभ संध्या", "सुप्रभात", "शुभ रात्रि", "नमस्ते"],
      answer: "सुप्रभात",
      hint: "☀️ Literally means ‘auspicious morning’."
    },
    {
      question: "What is the Hindi word for 'Water'?",
      options: ["दूध", "जल", "सिरका", "रस"],
      answer: "जल",
      hint: "💧 Sanskrit-origin word for water."
    },
    {
      question: "How do you say 'I am learning Hindi'?",
      options: ["मैं हिंदी सीख रहा हूँ", "मैं हिंदी बोलता हूँ", "मैं हिंदी जानता हूँ", "मैं हिंदी पढ़ता हूँ"],
      answer: "मैं हिंदी सीख रहा हूँ",
      hint: "📘 ‘सीख रहा हूँ’ = ‘am learning’."
    }
  ]);
}

if(lang === "Kannada") {
  return res.json([
    {
      question: "What is the Kannada word for 'Apple'?",
      options: ["ಸೇಬು", "ಬಾಳೆಹಣ್ಣು", "ಮಾವು", "ದ್ರಾಕ್ಷಿ"],
      answer: "ಸೇಬು",
      hint: "🍎 Sounds like ‘Sebu’, similar to Hindi ‘Seb’."
    },
    {
      question: "How do you say 'Thank you' in Kannada?",
      options: ["ಹಲೋ", "ಧನ್ಯವಾದಗಳು", "ವಿದಾಯ", "ದಯವಿಟ್ಟು"],
      answer: "ಧನ್ಯವಾದಗಳು",
      hint: "🙏 Formal way to say thanks."
    },
    {
      question: "How do you say 'Good morning' in Kannada?",
      options: ["ಶುಭ ರಾತ್ರಿ", "ಶುಭೋದಯ", "ಶುಭ ಸಂಜೆ", "ಹಲೋ"],
      answer: "ಶುಭೋದಯ",
      hint: "☀️ Means ‘auspicious dawn’."
    },
    {
      question: "What is the Kannada word for 'Water'?",
      options: ["ಹಾಲು", "ನೀರು", "ರಸ", "ಮದ್ಯ"],
      answer: "ನೀರು",
      hint: "💧 Commonly used word for water."
    },
    {
      question: "How do you say 'I am learning Kannada'?",
      options: ["ನಾನು ಕನ್ನಡ ಕಲಿಯುತ್ತಿದ್ದೇನೆ", "ನಾನು ಕನ್ನಡ ಮಾತಾಡುತ್ತೇನೆ", "ನಾನು ಕನ್ನಡ ತಿಳಿದಿದ್ದೇನೆ", "ನಾನು ಕನ್ನಡ ಓದುತ್ತಿದ್ದೇನೆ"],
      answer: "ನಾನು ಕನ್ನಡ ಕಲಿಯುತ್ತಿದ್ದೇನೆ",
      hint: "📘 ‘ಕಲಿಯುತ್ತಿದ್ದೇನೆ’ = learning."
    }
  ]);
}

if(lang === "Tamil") {
  return res.json([
    {
      question: "What is the Tamil word for 'Apple'?",
      options: ["ஆப்பிள்", "வாழைப்பழம்", "மாம்பழம்", "திராட்சை"],
      answer: "ஆப்பிள்",
      hint: "🍎 Sounds very similar to English."
    },
    {
      question: "How do you say 'Thank you' in Tamil?",
      options: ["வணக்கம்", "நன்றி", "பிரியா", "தயவு செய்து"],
      answer: "நன்றி",
      hint: "🙏 Used daily to express gratitude."
    },
    {
      question: "How do you say 'Good morning' in Tamil?",
      options: ["இரவு வணக்கம்", "காலை வணக்கம்", "மதிய வணக்கம்", "வணக்கம்"],
      answer: "காலை வணக்கம்",
      hint: "☀️ ‘காலை’ means morning."
    },
    {
      question: "What is the Tamil word for 'Water'?",
      options: ["பால்", "தண்ணீர்", "சாறு", "மதுவை"],
      answer: "தண்ணீர்",
      hint: "💧 Common household word for water."
    },
    {
      question: "How do you say 'I am learning Tamil'?",
      options: ["நான் தமிழ் கற்கிறேன்", "நான் தமிழ் பேசுகிறேன்", "நான் தமிழ் தெரிகிறது", "நான் தமிழ் படிக்கிறேன்"],
      answer: "நான் தமிழ் கற்கிறேன்",
      hint: "📘 ‘கற்கிறேன்’ means learning."
    }
  ]);
}

if(lang === "Telugu") {
  return res.json([
    {
      question: "What is the Telugu word for 'Apple'?",
      options: ["సేపు", "ఆపిల్", "మామిడి", "ద్రాక్ష"],
      answer: "ఆపిల్",
      hint: "🍎 Similar to the English word."
    },
    {
      question: "How do you say 'Thank you' in Telugu?",
      options: ["ధన్యవాదాలు", "నమస్కారం", "కృప", "దయచేసి"],
      answer: "ధన్యవాదాలు",
      hint: "🙏 Formal way to say thanks."
    },
    {
      question: "How do you say 'Good morning' in Telugu?",
      options: ["శుభరాత్రి", "శుభోదయం", "శుభమధ్యాహ్నం", "హలో"],
      answer: "శుభోదయం",
      hint: "☀️ Means ‘auspicious morning’."
    },
    {
      question: "What is the Telugu word for 'Water'?",
      options: ["నీరు", "పాలు", "రసం", "వైన్"],
      answer: "నీరు",
      hint: "💧 Used everywhere for water."
    },
    {
      question: "How do you say 'I am learning Telugu'?",
      options: ["నేను తెలుగు నేర్చుకుంటున్నాను", "నేను తెలుగు మాట్లాడుతున్నాను", "నేను తెలుగు తెలుసు", "నేను తెలుగు చదువుతున్నాను"],
      answer: "నేను తెలుగు నేర్చుకుంటున్నాను",
      hint: "📘 ‘నేర్చుకుంటున్నాను’ means learning."
    }
  ]);
}
if(lang === "Marathi") {
  return res.json([
    {
      question: "What is the Marathi word for 'Apple'?",
      options: ["सफरचंद", "केळी", "आंबा", "द्राक्ष"],
      answer: "सफरचंद",
      hint: "🍎 Sounds like ‘Safarchand’, means apple."
    },
    {
      question: "How do you say 'Thank you' in Marathi?",
      options: ["धन्यवाद", "नमस्कार", "कृपया", "सर्वोत्तम"],
      answer: "धन्यवाद",
      hint: "🙏 Used to thank politely."
    },
    {
      question: "How do you say 'Good morning' in Marathi?",
      options: ["शुभ रात्री", "सुप्रभात", "शुभ दुपारी", "नमस्कार"],
      answer: "सुप्रभात",
      hint: "☀️ Literally ‘auspicious morning’."
    },
    {
      question: "What is the Marathi word for 'Water'?",
      options: ["पाणी", "दूध", "रस", "सार"],
      answer: "पाणी",
      hint: "💧 Everyday word for water."
    },
    {
      question: "How do you say 'I am learning Marathi'?",
      options: ["मी मराठी शिकत आहे", "मी मराठी बोलतो आहे", "मी मराठी जाणतो", "मी मराठी वाचतो आहे"],
      answer: "मी मराठी शिकत आहे",
      hint: "📘 ‘शिकत आहे’ = learning."
    }
  ]);
}

if(lang === "Malayalam") {
  return res.json([
    {
      question: "What is the Malayalam word for 'Apple'?",
      options: ["ആപ്പിൾ", "മാമ്പഴം", "ബനാന", "മുന്തിരി"],
      answer: "ആപ്പിൾ",
      hint: "🍎 Sounds like English ‘apple’."
    },
    {
      question: "How do you say 'Thank you' in Malayalam?",
      options: ["നന്ദി", "ഹലോ", "വിട", "ദയവായി"],
      answer: "നന്ദി",
      hint: "🙏 Very common and polite."
    },
    {
      question: "How do you say 'Good morning' in Malayalam?",
      options: ["ശുഭ രാത്രി", "സുപ്രഭാതം", "ശുഭ സന്ദേഹം", "ഹലോ"],
      answer: "സുപ്രഭാതം",
      hint: "☀️ Means a bright good morning."
    },
    {
      question: "What is the Malayalam word for 'Water'?",
      options: ["വെള്ളം", "പാൽ", "ജ്യൂസ്", "വൈൻ"],
      answer: "വെള്ളം",
      hint: "💧 Commonly used for water."
    },
    {
      question: "How do you say 'I am learning Malayalam'?",
      options: ["ഞാൻ മലയാളം പഠിക്കുന്നു", "ഞാൻ മലയാളം സംസാരിക്കുന്നു", "ഞാൻ മലയാളം എഴുതുന്നു", "ഞാൻ മലയാളം വായിക്കുന്നു"],
      answer: "ഞാൻ മലയാളം പഠിക്കുന്നു",
      hint: "📘 ‘പഠിക്കുന്നു’ means learning/studying."
    }
  ]);
}

if(lang === "Bhojpuri") {
  return res.json([
    {
      question: "What is the Bhojpuri word for 'Apple'?",
      options: ["सेब", "केला", "अंगूर", "संतरा"],
      answer: "सेब",
      hint: "🍎 Same as Hindi — simple!"
    },
    {
      question: "How do you say 'Thank you' in Bhojpuri?",
      options: ["धन्यवाद", "नमस्ते", "अलविदा", "कृपया"],
      answer: "धन्यवाद",
      hint: "🙏 Same as Hindi, polite and respectful."
    },
    {
      question: "How do you say 'Good morning' in Bhojpuri?",
      options: ["सुप्रभात", "शुभ रात्रि", "नमस्ते", "अलविदा"],
      answer: "सुप्रभात",
      hint: "☀️ Common morning greeting."
    },
    {
      question: "What is the Bhojpuri word for 'Water'?",
      options: ["पानी", "दूध", "जूस", "शराब"],
      answer: "पानी",
      hint: "💧 Same as Hindi word for water."
    },
    {
      question: "How do you say 'I am learning Bhojpuri'?",
      options: ["हम भोजपुरी सीखत बानी", "हम भोजपुरी बोलत बानी", "हम भोजपुरी पढ़त बानी", "हम भोजपुरी लिखत बानी"],
      answer: "हम भोजपुरी सीखत बानी",
      hint: "📘 ‘सीखत बानी’ = am learning."
    }
  ]);
}

if(lang === "Rajasthani") {
  return res.json([
    {
      question: "What is the Rajasthani word for 'Apple'?",
      options: ["सेब", "केलो", "अंगूर", "संतरा"],
      answer: "सेब",
      hint: "🍎 Same as Hindi — easy start!"
    },
    {
      question: "How do you say 'Thank you' in Rajasthani?",
      options: ["धन्यवाद", "राम राम", "अलविदा", "कृपया"],
      answer: "धन्यवाद",
      hint: "🙏 Often said as ‘धन्यवाद सा’ respectfully."
    },
    {
      question: "How do you say 'Good morning' in Rajasthani?",
      options: ["राम राम सा", "सुप्रभात", "नमस्ते", "अलविदा"],
      answer: "राम राम सा",
      hint: "☀️ Traditional greeting used anytime."
    },
    {
      question: "What is the Rajasthani word for 'Water'?",
      options: ["पाणी", "दूध", "जूस", "शराब"],
      answer: "पाणी",
      hint: "💧 Same pronunciation as Marathi."
    },
    {
      question: "How do you say 'I am learning Rajasthani'?",
      options: ["मैं राजस्थानी सीख रियो हूँ", "मैं राजस्थानी बोल रियो हूँ", "मैं राजस्थानी पढ़ रियो हूँ", "मैं राजस्थानी लिख रियो हूँ"],
      answer: "मैं राजस्थानी सीख रियो हूँ",
      hint: "📘 ‘सीख रियो हूँ’ = am learning."
    }
  ]);
}

if(lang === "Punjabi") {
  return res.json([
    {
      question: "What is the Punjabi word for 'Apple'?",
      options: ["ਸੇਬ", "ਕੇਲਾ", "ਅੰਗੂਰ", "ਸੰਤਰਾ"],
      answer: "ਸੇਬ",
      hint: "🍎 Same as Hindi word — easy!"
    },
    {
      question: "How do you say 'Thank you' in Punjabi?",
      options: ["ਧੰਨਵਾਦ", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "ਅਲਵਿਦਾ", "ਕਿਰਪਾ"],
      answer: "ਧੰਨਵਾਦ",
      hint: "🙏 Used in polite and formal settings."
    },
    {
      question: "How do you say 'Good morning' in Punjabi?",
      options: ["ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "ਸ਼ੁਭ ਸਵੇਰ", "ਨਮਸਕਾਰ", "ਅਲਵਿਦਾ"],
      answer: "ਸ਼ੁਭ ਸਵੇਰ",
      hint: "☀️ ‘ਸਵੇਰ’ means morning."
    },
    {
      question: "What is the Punjabi word for 'Water'?",
      options: ["ਪਾਣੀ", "ਦੂਧ", "ਜੂਸ", "ਸ਼ਰਾਬ"],
      answer: "ਪਾਣੀ",
      hint: "💧 Same as Hindi word for water."
    },
    {
      question: "How do you say 'I am learning Punjabi'?",
      options: ["ਮੈਂ ਪੰਜਾਬੀ ਸਿੱਖ ਰਿਹਾ ਹਾਂ", "ਮੈਂ ਪੰਜਾਬੀ ਬੋਲ ਰਿਹਾ ਹਾਂ", "ਮੈਂ ਪੰਜਾਬੀ ਪੜ੍ਹ ਰਿਹਾ ਹਾਂ", "ਮੈਂ ਪੰਜਾਬੀ ਲਿਖ ਰਿਹਾ ਹਾਂ"],
      answer: "ਮੈਂ ਪੰਜਾਬੀ ਸਿੱਖ ਰਿਹਾ ਹਾਂ",
      hint: "📘 ‘ਸਿੱਖ ਰਿਹਾ ਹਾਂ’ means learning."
    }
  ]);
}

if(lang === "Kashmiri") {
  return res.json([
    {
      question: "What is the Kashmiri word for 'Apple'?",
      options: ["سیب", "کیلا", "انگور", "سنگترہ"],
      answer: "سیب",
      hint: "🍎 Same as Urdu — 'Seib'."
    },
    {
      question: "How do you say 'Thank you' in Kashmiri?",
      options: ["شکریہ", "سلام", "خدا حافظ", "مہربانی"],
      answer: "شکریہ",
      hint: "🙏 Common in Urdu & Persian too."
    },
    {
      question: "How do you say 'Good morning' in Kashmiri?",
      options: ["صبح بخیر", "شلام", "نمسکار", "الوداع"],
      answer: "صبح بخیر",
      hint: "☀️ Means ‘good morning’ exactly."
    },
    {
      question: "What is the Kashmiri word for 'Water'?",
      options: ["پانی", "دودھ", "جوس", "شراب"],
      answer: "پانی",
      hint: "💧 Same as Urdu and Hindi word."
    },
    {
      question: "How do you say 'I am learning Kashmiri'?",
      options: ["می چھُ کشمیری سیکھان", "می چھُ کشمیری بولان", "می چھُ کشمیری پڈھان", "می چھُ کشمیری لکھان"],
      answer: "می چھُ کشمیری سیکھان",
      hint: "📘 ‘سیکھان’ means to learn."
    }
  ]);
}

if(lang === "Urdu") {
  return res.json([
    {
      question: "What is the Urdu word for 'Apple'?",
      options: ["سیب", "کیلا", "انگور", "آڑو"],
      answer: "سیب",
      hint: "🍎 Same word as Persian & Hindi."
    },
    {
      question: "How do you say 'Thank you' in Urdu?",
      options: ["شکریہ", "سلام", "الوداع", "مہربانی"],
      answer: "شکریہ",
      hint: "🙏 The most common polite phrase."
    },
    {
      question: "How do you say 'Good morning' in Urdu?",
      options: ["صبح بخیر", "شب بخیر", "ہیلو", "الوداع"],
      answer: "صبح بخیر",
      hint: "☀️ Literally means ‘good morning’."
    },
    {
      question: "What is the Urdu word for 'Water'?",
      options: ["پانی", "دودھ", "جوس", "شراب"],
      answer: "پانی",
      hint: "💧 Same word used across South Asia."
    },
    {
      question: "How do you say 'I am learning Urdu'?",
      options: ["میں اردو سیکھ رہا ہوں", "میں اردو بول رہا ہوں", "میں اردو پڑھ رہا ہوں", "میں اردو لکھ رہا ہوں"],
      answer: "میں اردو سیکھ رہا ہوں",
      hint: "📘 ‘سیکھ رہا ہوں’ means I am learning."
    }
  ]);
}



  res.status(404).json({ message: "Questions not found for this language" });
});

// ===============================
// LESSON PROGRESS ENDPOINT
// ===============================
app.get('/api/progress/:email/:lang', async (req, res) => {
  const { email, lang } = req.params;
  const column = getProgressColumn(lang);
  if (!column) return res.status(400).json({ message: 'Unsupported language' });

  try {
    const [rows] = await db.execute(`SELECT xp, level, ${column} AS progress FROM users WHERE email = ?`, [email]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const progress = rows[0].progress || 0;
    const totalLessons = 10;
    return res.json({
      xp: rows[0].xp,
      level: rows[0].level,
      lessonsCompleted: progress,
      totalLessons
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Progress fetch failed' });
  }
});


// Submit quiz
app.post('/api/submit', async (req, res) => {
  try {
    const { email, score, lang } = req.body;
    if (!email || typeof score === 'undefined' || !lang) {
      return res.status(400).json({ message: 'email, score and lang required' });
    }

    const progressCol = getProgressColumn(lang);
    if (!progressCol) return res.status(400).json({ message: 'Unsupported language' });

    const xpGain = Number(score) * 10;

    // Fetch current xp and current progress for that language
    const [rows] = await db.execute(`SELECT xp, ${progressCol} AS progress FROM users WHERE email = ?`, [email]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const currentXP = (rows[0].xp || 0) + xpGain;
    const newProgress = (rows[0].progress || 0) + 1;

    // Level calc
    let level = 'Beginner';
    if (currentXP >= 100 && currentXP < 300) level = 'Intermediate';
    else if (currentXP >= 300 && currentXP < 600) level = 'Advanced';
    else if (currentXP >= 600) level = 'Expert';

    // Update DB — note column name validated earlier
    await db.execute(
      `UPDATE users SET xp = ?, level = ?, ${progressCol} = ? WHERE email = ?`,
      [currentXP, level, newProgress, email]
    );

    return res.json({
      message: 'Progress updated!',
      xp: currentXP,
      level,
      lessonsCompleted: newProgress
    });
  } catch (err) {
    console.error("Submit error:", err);
    return res.status(500).json({ message: 'Error submitting quiz' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT name, learning_lang, score, xp, level FROM users ORDER BY xp DESC LIMIT 10');
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// ==============================================
// Complete Lesson Endpoint (XP + Level + Streak)
// ==============================================
// Complete Lesson (accepts lang to also bump progress_col optionally)
// ===============================
app.post('/api/complete-lesson', async (req, res) => {
  try {
    const { email, gainedXP = 20, lang } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const [rows] = await db.execute('SELECT xp, level, last_active, streak FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const user = rows[0];
    const today = new Date().toISOString().split('T')[0];
    let streak = user.streak || 0;

    if (user.last_active) {
      const lastActive = new Date(user.last_active);
      const diffDays = Math.floor((new Date(today) - lastActive) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) streak += 1;
      else if (diffDays > 1) streak = 1;
    } else {
      streak = 1;
    }

    const newXP = (user.xp || 0) + Number(gainedXP);
    let newLevel = 'Beginner';
    if (newXP >= 100 && newXP < 300) newLevel = 'Intermediate';
    else if (newXP >= 300 && newXP < 600) newLevel = 'Advanced';
    else if (newXP >= 600) newLevel = 'Expert';

    // Update main fields first
    await db.execute('UPDATE users SET xp = ?, level = ?, last_active = ?, streak = ? WHERE email = ?', [newXP, newLevel, today, streak, email]);

    // Optionally bump progress for specific language (if provided)
    if (lang) {
      const progressCol = getProgressColumn(lang);
      if (progressCol) {
        await db.execute(`UPDATE users SET ${progressCol} = ${progressCol} + 1 WHERE email = ?`, [email]);
      }
    }

    return res.json({ message: 'Lesson completed successfully!', xp: newXP, level: newLevel, streak });
  } catch (err) {
    console.error('❌ Error completing lesson:', err);
    return res.status(500).json({ message: 'Error completing lesson' });
  }
});


// ===============================
// Server Setup
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 LangLink+ Backend running on port ${PORT}`);
});