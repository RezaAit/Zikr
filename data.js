// Predefined zikir library: { name, target, category }
// target = recommended repetition count; 0 = no fixed count (free style)
window.ZIKIR_LIBRARY = [
  // --- Core tasbih (after-salah) ---
  { name: 'সুবহানাল্লাহ', target: 33, category: 'মূল তাসবীহ' },
  { name: 'আলহামদুলিল্লাহ', target: 33, category: 'মূল তাসবীহ' },
  { name: 'আল্লাহু আকবার', target: 34, category: 'মূল তাসবীহ' },
  { name: 'লা ইলাহা ইল্লাল্লাহু ওয়াহদাহু লা শারীকালাহ', target: 10, category: 'মূল তাসবীহ' },
  { name: 'সুবহানাল্লাহি ওয়া বিহামদিহি', target: 100, category: 'মূল তাসবীহ' },
  { name: 'সুবহানাল্লাহিল আজীম', target: 100, category: 'মূল তাসবীহ' },
  { name: 'লা হাওলা ওয়ালা কুউওয়াতা ইল্লা বিল্লাহ', target: 100, category: 'মূল তাসবীহ' },

  // --- Istighfar / repentance ---
  { name: 'আস্তাগফিরুল্লাহ', target: 100, category: 'ইস্তিগফার' },
  { name: 'আস্তাগফিরুল্লাহাল আজীম', target: 100, category: 'ইস্তিগফার' },
  { name: 'আস্তাগফিরুল্লাহা রাব্বী মিন কুল্লি জাম্বিওঁ ওয়া আতুবু ইলাইহি', target: 100, category: 'ইস্তিগফার' },
  { name: 'রাব্বিগফির লী', target: 100, category: 'ইস্তিগফার' },
  { name: 'রাব্বিগফির লী ওয়া তুব আলাইয়া', target: 70, category: 'ইস্তিগফার' },
  { name: 'সাইয়িদুল ইস্তিগফার', target: 1, category: 'ইস্তিগফার' },

  // --- Tahlil / tawhid ---
  { name: 'লা ইলাহা ইল্লাল্লাহ', target: 100, category: 'তাহলীল' },
  { name: 'লা ইলাহা ইল্লা আনতা সুবহানাকা ইন্নী কুনতু মিনাজ জালিমীন', target: 100, category: 'তাহলীল' },

  // --- Durood / salutation on the Prophet ---
  { name: 'আল্লাহুম্মা সাল্লি আলা মুহাম্মাদ', target: 100, category: 'দরুদ' },
  { name: 'দরুদে ইব্রাহীম', target: 10, category: 'দরুদ' },
  { name: 'দরুদে শরীফ (সংক্ষিপ্ত)', target: 100, category: 'দরুদ' },
  { name: 'সাল্লাল্লাহু আলাইহি ওয়াসাল্লাম', target: 100, category: 'দরুদ' },

  // --- Tahmid / gratitude ---
  { name: 'আলহামদুলিল্লাহি রাব্বিল আলামীন', target: 33, category: 'তাহমীদ' },
  { name: 'আলহামদুলিল্লাহি আলা কুল্লি হাল', target: 33, category: 'তাহমীদ' },
  { name: 'শুকরান লিল্লাহ', target: 33, category: 'তাহমীদ' },

  // --- Tasbih variations ---
  { name: 'সুবহান রাব্বিয়াল আজীম', target: 33, category: 'তাসবীহ' },
  { name: 'সুবহান রাব্বিয়াল আলা', target: 33, category: 'তাসবীহ' },
  { name: 'সুবহানাল্লাহি ওয়াল হামদুলিল্লাহি ওয়ালা ইলাহা ইল্লাল্লাহু ওয়াল্লাহু আকবার', target: 25, category: 'তাসবীহ' },

  // --- Tahleel / praise combos ---
  { name: 'লা ইলাহা ইল্লাল্লাহু মুহাম্মাদুর রাসুলুল্লাহ', target: 100, category: 'কালিমা' },
  { name: 'কালিমা তাইয়িবা', target: 100, category: 'কালিমা' },
  { name: 'কালিমা শাহাদাত', target: 33, category: 'কালিমা' },

  // --- Hasbunallah / trust in Allah ---
  { name: 'হাসবুনাল্লাহু ওয়া নি\'মাল ওয়াকীল', target: 100, category: 'তাওয়াক্কুল' },
  { name: 'তাওয়াক্কালতু আলাল্লাহ', target: 33, category: 'তাওয়াক্কুল' },

  // --- Salawat variations ---
  { name: 'আল্লাহুম্মা সাল্লি আলা মুহাম্মাদিও ওয়া আলা আলি মুহাম্মাদ', target: 100, category: 'দরুদ' },

  // --- Protection / refuge ---
  { name: 'আউযুবিল্লাহি মিনাশ শাইতানির রাজীম', target: 33, category: 'আশ্রয়প্রার্থনা' },
  { name: 'আউযু বিকালিমাতিল্লাহিত তাম্মাতি মিন শাররি মা খালাক', target: 7, category: 'আশ্রয়প্রার্থনা' },
  { name: 'বিসমিল্লাহিল্লাযী লা ইয়াদুররু মাআসমিহী শাইউন', target: 3, category: 'আশ্রয়প্রার্থনা' },

  // --- Quranic dhikr / dua phrases ---
  { name: 'রাব্বানা আতিনা ফিদ দুনইয়া হাসানাহ', target: 33, category: 'কুরআনিক দোয়া' },
  { name: 'রাব্বি যিদনী ইলমা', target: 33, category: 'কুরআনিক দোয়া' },
  { name: 'রাব্বিশরাহ লী সদরী', target: 7, category: 'কুরআনিক দোয়া' },
  { name: 'রাব্বানাগফির লানা ওয়া লি ইখওয়ানিনা', target: 33, category: 'কুরআনিক দোয়া' },
  { name: 'হাসবিয়াল্লাহু লা ইলাহা ইল্লা হুয়া', target: 7, category: 'কুরআনিক দোয়া' },

  // --- Asma-ul-Husna (selected names) ---
  { name: 'ইয়া রাহমান', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া রাহীম', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া লাতীফ', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া কারীম', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া গাফফার', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া রাজ্জাক', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া ফাত্তাহ', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া হাফিজ', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া ওয়াদুদ', target: 100, category: 'আসমাউল হুসনা' },
  { name: 'ইয়া শাফি', target: 100, category: 'আসমাউল হুসনা' },

  // --- Morning/evening adhkar ---
  { name: 'আল্লাহুম্মা বিকা আসবাহনা ওয়া বিকা আমসাইনা', target: 1, category: 'সকাল-সন্ধ্যার যিকির' },
  { name: 'রাদীতু বিল্লাহি রাব্বা', target: 3, category: 'সকাল-সন্ধ্যার যিকির' },
  { name: 'ইয়া হাইয়ু ইয়া কাইয়ুম বিরাহমাতিকা আস্তাগীস', target: 1, category: 'সকাল-সন্ধ্যার যিকির' },

  // --- Tahajjud / night ---
  { name: 'আল্লাহুম্মা লাকাল হামদ', target: 33, category: 'রাত্রিকালীন যিকির' },
  { name: 'আল্লাহুম্মা ইন্নাকা আফুউউন তুহিব্বুল আফওয়া ফাফু আন্নী', target: 33, category: 'রাত্রিকালীন যিকির' },

  // --- Misc / general ---
  { name: 'বিসমিল্লাহির রাহমানির রাহীম', target: 21, category: 'সাধারণ' },
  { name: 'ইন্না লিল্লাহি ওয়া ইন্না ইলাইহি রাজিউন', target: 7, category: 'সাধারণ' },
  { name: 'মাশাআল্লাহ', target: 33, category: 'সাধারণ' },
  { name: 'জাযাকাল্লাহু খাইরান', target: 33, category: 'সাধারণ' },
  { name: 'তাবারাকাল্লাহ', target: 33, category: 'সাধারণ' }
];
