# তাসবীহ কাউন্টার (Tasbeeh Counter)

একটি PWA (Progressive Web App) ডিজিটাল তাসবীহ/যিকির কাউন্টার। ৫০+ প্রিসেট যিকির, নিজস্ব যিকির যোগ, স্ট্রিক, পরিসংখ্যান, একাধিক থিম ও সাউন্ড সহ।

## ফিচার

- ৫০+ প্রিসেট যিকির, ক্যাটাগরি অনুযায়ী সার্চযোগ্য তালিকা
- নিজস্ব (free-text) যিকির যোগ করার অপশন
- মুক্ত গণনা (কোনো লক্ষ্য ছাড়া) মোড
- দৈনিক লক্ষ্য ও স্ট্রিক ট্র্যাকিং
- সাপ্তাহিক পরিসংখ্যান চার্ট
- ২৫%/৫০%/৭৫%/১০০% মাইলফলক উদযাপন (sparks + কম্পন)
- ৪ ধরনের সিন্থেসাইজড শব্দ: পানির ফোঁটা, কাঠের টাক, ঘণ্টা, ক্লিক
- ৩টি থিম: পান্না সবুজ, মিডনাইট, সেপিয়া
- সম্পূর্ণ অফলাইন কাজ করে (PWA + Service Worker)
- ইনস্টলযোগ্য (Add to Home Screen)
- সব ডেটা localStorage-এ ডিভাইসেই থাকে — কোনো সার্ভার/ব্যাকএন্ড নেই

## লোকাল টেস্ট

```bash
npx serve .
# অথবা
python3 -m http.server 8080
```

তারপর ব্রাউজারে `http://localhost:8080` খুলুন।

> **নোট:** Service Worker `https://` অথবা `localhost`-এ কাজ করে, `file://` প্রোটোকলে নয়।

## Vercel-এ ডিপ্লয়

### Vercel CLI দিয়ে

```bash
npm i -g vercel
cd tajbih-counter
vercel
```

প্রম্পট অনুযায়ী এগিয়ে যান (Framework: **Other**, Build Command: ফাঁকা রাখুন, Output Directory: `.`)

প্রোডাকশনে ডিপ্লয় করতে:

```bash
vercel --prod
```

### GitHub দিয়ে (সুপারিশকৃত)

1. এই ফোল্ডারটি একটি GitHub রিপোতে পুশ করুন
2. [vercel.com/new](https://vercel.com/new) এ গিয়ে রিপো ইম্পোর্ট করুন
3. Framework Preset: **Other** নির্বাচন করুন
4. Build Command ও Output Directory খালি/ডিফল্ট রাখুন
5. Deploy ক্লিক করুন

কোনো এনভায়রনমেন্ট ভ্যারিয়েবল বা ব্যাকএন্ড সেটআপ লাগবে না — এটি ১০০% স্ট্যাটিক সাইট।

## ফাইল গঠন

```
tajbih-counter/
├── index.html       # মূল HTML
├── style.css        # সব স্টাইল (থিম সহ)
├── script.js        # অ্যাপ লজিক
├── data.js          # ৫০+ প্রিসেট যিকিরের তালিকা
├── manifest.json     # PWA ম্যানিফেস্ট
├── sw.js            # Service Worker (অফলাইন ক্যাশিং)
├── vercel.json       # Vercel হেডার কনফিগ
├── icons/            # PWA আইকন (192/512/maskable/apple)
└── package.json
```

## নতুন যিকির যোগ করতে

`data.js` ফাইলে `window.ZIKIR_LIBRARY` অ্যারেতে নতুন অবজেক্ট যোগ করুন:

```js
{ name: 'যিকিরের নাম', target: 33, category: 'ক্যাটাগরি' }
```

`target: 0` দিলে সেটি "মুক্ত গণনা" (কোনো লক্ষ্য ছাড়া) হিসেবে গণ্য হবে।
