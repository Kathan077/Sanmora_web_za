"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  Settings,
  HelpCircle,
  X,
  Mic,
  Check,
  Eye,
  Sliders,
  Bell,
  Search,
  Globe
} from "lucide-react";
import styles from "./VoiceAssistant.module.css";

// Comprehensive Multi-Language Dataset (23 Indian + 30 African + 11 Global = 64 Total Languages)
const ALL_LANGUAGES = [
  // ── 23 Indian Languages (All Official 22 8th Schedule Languages + English India) ──
  { code: "en", name: "English (India)", native: "English", bcp47: "en-IN", category: "India", regionBadge: "IN" },
  { code: "hi", name: "Hindi", native: "हिन्दी", bcp47: "hi-IN", category: "India", regionBadge: "IN" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", bcp47: "gu-IN", category: "India", regionBadge: "IN" },
  { code: "mr", name: "Marathi", native: "मराठी", bcp47: "mr-IN", category: "India", regionBadge: "IN" },
  { code: "ta", name: "Tamil", native: "தமிழ்", bcp47: "ta-IN", category: "India", regionBadge: "IN" },
  { code: "te", name: "Telugu", native: "తెలుగు", bcp47: "te-IN", category: "India", regionBadge: "IN" },
  { code: "bn", name: "Bengali", native: "বাংলা", bcp47: "bn-IN", category: "India", regionBadge: "IN" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", bcp47: "kn-IN", category: "India", regionBadge: "IN" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", bcp47: "ml-IN", category: "India", regionBadge: "IN" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", bcp47: "pa-IN", category: "India", regionBadge: "IN" },
  { code: "ur", name: "Urdu", native: "اردو", bcp47: "ur-IN", category: "India", regionBadge: "IN" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", bcp47: "or-IN", category: "India", regionBadge: "IN" },
  { code: "as", name: "Assamese", native: "অসমীয়া", bcp47: "as-IN", category: "India", regionBadge: "IN" },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्", bcp47: "sa-IN", category: "India", regionBadge: "IN" },
  { code: "mai", name: "Maithili", native: "मैथिली", bcp47: "mai-IN", category: "India", regionBadge: "IN" },
  { code: "ks", name: "Kashmiri", native: "कश्मीरी", bcp47: "ks-IN", category: "India", regionBadge: "IN" },
  { code: "ne", name: "Nepali", native: "नेपाली", bcp47: "ne-IN", category: "India", regionBadge: "IN" },
  { code: "sd", name: "Sindhi", native: "सिन्धी", bcp47: "sd-IN", category: "India", regionBadge: "IN" },
  { code: "kok", name: "Konkani", native: "कोंकणी", bcp47: "kok-IN", category: "India", regionBadge: "IN" },
  { code: "doi", name: "Dogri", native: "डोगरी", bcp47: "doi-IN", category: "India", regionBadge: "IN" },
  { code: "mni", name: "Manipuri (Meitei)", native: "मणिपुरी", bcp47: "mni-IN", category: "India", regionBadge: "IN" },
  { code: "brx", name: "Bodo", native: "बोडो", bcp47: "brx-IN", category: "India", regionBadge: "IN" },
  { code: "sat", name: "Santali", native: "संथाली", bcp47: "sat-IN", category: "India", regionBadge: "IN" },

  // ── 30 African Languages (South Africa & Entire African Continent) ──
  { code: "en-ZA", name: "English (South Africa)", native: "English (SA)", bcp47: "en-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "af", name: "Afrikaans", native: "Afrikaans", bcp47: "af-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "zu", name: "Zulu", native: "isiZulu", bcp47: "zu-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "xh", name: "Xhosa", native: "isiXhosa", bcp47: "xh-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "st", name: "Sesotho", native: "Sesotho", bcp47: "st-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "tn", name: "Setswana", native: "Setswana", bcp47: "tn-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "nso", name: "Sepedi", native: "Sepedi", bcp47: "nso-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "ts", name: "Xitsonga", native: "Xitsonga", bcp47: "ts-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "ss", name: "siSwati", native: "siSwati", bcp47: "ss-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "ve", name: "Tshivenda", native: "Tshivenda", bcp47: "ve-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "nr", name: "isiNdebele", native: "isiNdebele", bcp47: "nr-ZA", category: "Africa", regionBadge: "ZA" },
  { code: "sw", name: "Swahili", native: "Kiswahili", bcp47: "sw-KE", category: "Africa", regionBadge: "AFRICA" },
  { code: "am", name: "Amharic", native: "አማርኛ", bcp47: "am-ET", category: "Africa", regionBadge: "AFRICA" },
  { code: "ha", name: "Hausa", native: "هَوُسَ", bcp47: "ha-NG", category: "Africa", regionBadge: "AFRICA" },
  { code: "yo", name: "Yoruba", native: "Èdè Yorùbá", bcp47: "yo-NG", category: "Africa", regionBadge: "AFRICA" },
  { code: "ig", name: "Igbo", native: "Asụsụ Igbo", bcp47: "ig-NG", category: "Africa", regionBadge: "AFRICA" },
  { code: "sn", name: "Shona", native: "chiShona", bcp47: "sn-ZW", category: "Africa", regionBadge: "AFRICA" },
  { code: "so", name: "Somali", native: "Soomaali", bcp47: "so-SO", category: "Africa", regionBadge: "AFRICA" },
  { code: "ny", name: "Chichewa", native: "Nyanja", bcp47: "ny-MW", category: "Africa", regionBadge: "AFRICA" },
  { code: "mg", name: "Malagasy", native: "Malagasy", bcp47: "mg-MG", category: "Africa", regionBadge: "AFRICA" },
  { code: "rw", name: "Kinyarwanda", native: "Ikinyarwanda", bcp47: "rw-RW", category: "Africa", regionBadge: "AFRICA" },
  { code: "om", name: "Oromo", native: "Afaan Oromoo", bcp47: "om-ET", category: "Africa", regionBadge: "AFRICA" },
  { code: "ti", name: "Tigrinya", native: "ትግርኛ", bcp47: "ti-ET", category: "Africa", regionBadge: "AFRICA" },
  { code: "lg", name: "Luganda", native: "Oluganda", bcp47: "lg-UG", category: "Africa", regionBadge: "AFRICA" },
  { code: "ln", name: "Lingala", native: "Lingála", bcp47: "ln-CD", category: "Africa", regionBadge: "AFRICA" },
  { code: "bm", name: "Bambara", native: "Bamanankan", bcp47: "bm-ML", category: "Africa", regionBadge: "AFRICA" },
  { code: "ee", name: "Ewe", native: "Èʋegbe", bcp47: "ee-GH", category: "Africa", regionBadge: "AFRICA" },
  { code: "ff", name: "Fulani", native: "Fulfulde", bcp47: "ff-SN", category: "Africa", regionBadge: "AFRICA" },
  { code: "ak", name: "Twi (Akan)", native: "Twi", bcp47: "ak-GH", category: "Africa", regionBadge: "AFRICA" },
  { code: "wo", name: "Wolof", native: "Wolof", bcp47: "wo-SN", category: "Africa", regionBadge: "AFRICA" },

  // ── 11 Global Languages ──
  { code: "es", name: "Spanish", native: "Español", bcp47: "es-ES", category: "Global", regionBadge: "GLOBAL" },
  { code: "fr", name: "French", native: "Français", bcp47: "fr-FR", category: "Global", regionBadge: "GLOBAL" },
  { code: "de", name: "German", native: "Deutsch", bcp47: "de-DE", category: "Global", regionBadge: "GLOBAL" },
  { code: "zh-CN", name: "Chinese (Simplified)", native: "中文 (简体)", bcp47: "zh-CN", category: "Global", regionBadge: "GLOBAL" },
  { code: "ja", name: "Japanese", native: "日本語", bcp47: "ja-JP", category: "Global", regionBadge: "GLOBAL" },
  { code: "ar", name: "Arabic", native: "العربية", bcp47: "ar-SA", category: "Global", regionBadge: "GLOBAL" },
  { code: "pt", name: "Portuguese", native: "Português", bcp47: "pt-PT", category: "Global", regionBadge: "GLOBAL" },
  { code: "ru", name: "Russian", native: "Русский", bcp47: "ru-RU", category: "Global", regionBadge: "GLOBAL" },
  { code: "it", name: "Italian", native: "Italiano", bcp47: "it-IT", category: "Global", regionBadge: "GLOBAL" },
  { code: "nl", name: "Dutch", native: "Nederlands", bcp47: "nl-NL", category: "Global", regionBadge: "GLOBAL" },
  { code: "ko", name: "Korean", native: "한국어", bcp47: "ko-KR", category: "Global", regionBadge: "GLOBAL" }
];

export default function VoiceAssistant() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [selectedLang, setSelectedLang] = useState(ALL_LANGUAGES[0]);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [soundEffects, setSoundEffects] = useState(true);
  const [currentlySpeaking, setCurrentlySpeaking] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // Full Page Speech Reader state
  const [isReadingPage, setIsReadingPage] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingProgress, setReadingProgress] = useState({ current: 0, total: 0 });

  // Settings modal filter state
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const activeElementRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const synthRef = useRef(null);
  const translationCache = useRef({});

  // Full page reading refs
  const readableElementsRef = useRef([]);
  const readingIndexRef = useRef(0);
  const isReadingActiveRef = useRef(false);
  const readChunkRef = useRef(null);

  // Initialize Web Speech Synthesis & load available voices
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;

      const updateVoices = () => {
        const available = synthRef.current.getVoices();
        setVoices(available);
      };

      updateVoices();
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = updateVoices;
      }
    }
  }, []);

  // Compute active matching voice dynamically without synchronous setState in effect
  const activeVoice = useMemo(() => {
    if (voices.length === 0) return null;
    if (selectedVoiceURI) {
      const customVoice = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (customVoice) return customVoice;
    }
    const targetBcp47 = selectedLang.bcp47;
    const targetLangCode = selectedLang.code;
    return (
      voices.find((v) => v.lang === targetBcp47) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(targetLangCode.toLowerCase())) ||
      voices.find((v) => v.lang.includes("en-IN") || v.lang.includes("en-ZA") || v.lang.includes("en-US") || v.lang.includes("en")) ||
      voices[0] ||
      null
    );
  }, [voices, selectedVoiceURI, selectedLang]);

  // Sync Google Translate Cookie & DOM Widget on Language Change
  const syncDOMTranslation = useCallback((langCode) => {
    if (typeof document === "undefined") return;
    try {
      const cleanCode = langCode.split("-")[0];
      const cookieValue = `googtrans=/en/${cleanCode}`;
      document.cookie = `${cookieValue}; path=/;`;
      if (window.location.hostname) {
        document.cookie = `${cookieValue}; path=/; domain=${window.location.hostname};`;
      }
      const combo = document.querySelector(".goog-te-combo");
      if (combo) {
        combo.value = cleanCode;
        combo.dispatchEvent(new Event("change"));
      }
    } catch (e) {
      // Ignore translation widget cookie errors
    }
  }, []);

  // Audio Feedback Chimes using Web Audio API
  const playAudioChime = useCallback(
    (type) => {
      if (!soundEffects || typeof window === "undefined") return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === "on") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
        } else if (type === "off") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
        } else if (type === "click") {
          osc.type = "triangle";
          osc.frequency.setValueAtTime(587.33, now);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
        } else if (type === "finish") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.setValueAtTime(659.25, now + 0.1);
          osc.frequency.setValueAtTime(783.99, now + 0.2);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.35);
        }
      } catch (err) {
        // Silent audio chime fallback
      }
    },
    [soundEffects]
  );

  // Real-Time Google Translate API with MyMemory Fallback
  const translateText = useCallback(async (text, targetLang) => {
    if (!text || !targetLang || targetLang === "en" || targetLang === "en-ZA" || targetLang === "en-IN") return text;

    const cleanTarget = targetLang.split("-")[0];
    const cacheKey = `${cleanTarget}:${text}`;
    if (translationCache.current[cacheKey]) {
      return translationCache.current[cacheKey];
    }

    try {
      const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${cleanTarget}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(googleUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data[0]) {
          const translated = data[0].map((item) => item[0]).join("");
          if (translated) {
            translationCache.current[cacheKey] = translated;
            return translated;
          }
        }
      }
    } catch (e) {
      // Google Translate fetch fallback
    }

    try {
      const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|${cleanTarget}`;
      const res = await fetch(myMemoryUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.responseData?.translatedText) {
          const translated = data.responseData.translatedText;
          translationCache.current[cacheKey] = translated;
          return translated;
        }
      }
    } catch (e) {
      // MyMemory fallback error
    }

    return text;
  }, []);

  // Visual Highlight Helpers
  const clearHighlight = useCallback(() => {
    if (activeElementRef.current) {
      activeElementRef.current.classList.remove("tts-active-reading-chunk", "voice-active-element");
      activeElementRef.current = null;
    }
  }, []);

  const applyHighlight = useCallback(
    (el) => {
      clearHighlight();
      if (el && el.classList) {
        el.classList.add("tts-active-reading-chunk");
        activeElementRef.current = el;
      }
    },
    [clearHighlight]
  );

  // Stop all speech playback immediately
  const stopSpeech = useCallback(() => {
    isReadingActiveRef.current = false;
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsReadingPage(false);
    setIsPaused(false);
    setCurrentlySpeaking("");
    clearHighlight();
  }, [clearHighlight]);

  // Speak raw string text
  const speakText = useCallback(
    async (text, targetElement = null, onEndCallback = null) => {
      if (!synthRef.current || !text) return;

      try {
        synthRef.current.cancel();
      } catch (e) {
        // ignore
      }

      const cleanedText = text.trim().replace(/\s+/g, " ");
      if (!cleanedText) return;

      const translated = await translateText(cleanedText, selectedLang.code);

      const utterance = new SpeechSynthesisUtterance(translated || cleanedText);
      utterance.lang = selectedLang.bcp47;
      utterance.rate = rate;
      utterance.pitch = pitch;

      if (activeVoice) {
        utterance.voice = activeVoice;
      }

      setCurrentlySpeaking(translated || cleanedText);
      setLiveAnnouncement(translated || cleanedText);

      if (targetElement) {
        applyHighlight(targetElement);
      }

      utterance.onend = () => {
        setCurrentlySpeaking("");
        clearHighlight();
        if (onEndCallback) onEndCallback();
      };

      utterance.onerror = () => {
        setCurrentlySpeaking("");
        clearHighlight();
      };

      try {
        synthRef.current.speak(utterance);
      } catch (err) {
        setCurrentlySpeaking("");
        clearHighlight();
      }
    },
    [rate, pitch, selectedLang, activeVoice, translateText, applyHighlight, clearHighlight]
  );

  // ── Sequential Full Page Speech Reader Implementation ──
  const readChunk = useCallback(
    async (index, elements) => {
      if (!isReadingActiveRef.current || index >= elements.length) {
        clearHighlight();
        setIsReadingPage(false);
        setIsPaused(false);
        setCurrentlySpeaking("");
        if (index >= elements.length) {
          playAudioChime("finish");
          setLiveAnnouncement("Finished reading page.");
        }
        return;
      }

      const el = elements[index];
      if (!el) {
        readChunkRef.current?.(index + 1, elements);
        return;
      }

      // Smooth scroll to active chunk element
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {
        // fallback
      }

      applyHighlight(el);
      setReadingProgress({ current: index + 1, total: elements.length });

      const rawText = el.innerText || el.textContent || "";
      const cleaned = rawText.trim().replace(/\s+/g, " ");

      if (!cleaned || cleaned.length < 2) {
        readChunkRef.current?.(index + 1, elements);
        return;
      }

      setCurrentlySpeaking(`Translating (${index + 1}/${elements.length})...`);
      const spokenText = await translateText(cleaned, selectedLang.code);

      if (!isReadingActiveRef.current) return;

      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = selectedLang.bcp47;
      utterance.rate = rate;
      utterance.pitch = pitch;

      if (activeVoice) {
        utterance.voice = activeVoice;
      }

      setCurrentlySpeaking(spokenText);
      setLiveAnnouncement(spokenText);

      utterance.onend = () => {
        if (isReadingActiveRef.current) {
          readingIndexRef.current = index + 1;
          readChunkRef.current?.(index + 1, elements);
        }
      };

      utterance.onerror = () => {
        if (isReadingActiveRef.current) {
          readingIndexRef.current = index + 1;
          readChunkRef.current?.(index + 1, elements);
        }
      };

      try {
        synthRef.current.cancel();
        synthRef.current.speak(utterance);
      } catch (e) {
        readChunkRef.current?.(index + 1, elements);
      }
    },
    [selectedLang, rate, pitch, activeVoice, translateText, applyHighlight, clearHighlight, playAudioChime]
  );

  useEffect(() => {
    readChunkRef.current = readChunk;
  }, [readChunk]);

  const startPageReading = useCallback(() => {
    if (!synthRef.current) return;

    // If currently reading: toggle pause / resume
    if (isReadingPage) {
      if (isPaused) {
        synthRef.current.resume();
        setIsPaused(false);
        playAudioChime("click");
      } else {
        synthRef.current.pause();
        setIsPaused(true);
        playAudioChime("click");
      }
      return;
    }

    // Collect readable elements from <main> container
    const mainContainer =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body;

    if (!mainContainer) return;

    const query = "h1, h2, h3, h4, h5, h6, p, li, blockquote, article";
    const rawElements = Array.from(mainContainer.querySelectorAll(query));

    const validElements = rawElements.filter((el) => {
      if (
        el.closest(`.${styles.voiceWidgetContainer}`) ||
        el.closest(`.${styles.modalOverlay}`) ||
        el.getAttribute("aria-hidden") === "true" ||
        el.offsetWidth === 0 ||
        el.offsetHeight === 0
      ) {
        return false;
      }
      const text = el.innerText || el.textContent || "";
      return text.trim().length >= 2;
    });

    if (validElements.length === 0) {
      speakText("No readable page text found.");
      return;
    }

    readableElementsRef.current = validElements;
    readingIndexRef.current = 0;
    isReadingActiveRef.current = true;

    setIsReadingPage(true);
    setIsPaused(false);
    playAudioChime("on");

    readChunk(0, validElements);
  }, [isReadingPage, isPaused, playAudioChime, readChunk, speakText]);

  // Extract clean speakable text from DOM element on hover/focus
  const getSpeakableDetails = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

    if (
      el.closest(`.${styles.voiceWidgetContainer}`) ||
      el.closest(`.${styles.modalOverlay}`) ||
      el.getAttribute("aria-hidden") === "true" ||
      el.tagName === "SCRIPT" ||
      el.tagName === "STYLE" ||
      el.tagName === "NOSCRIPT"
    ) {
      return null;
    }

    let content = "";
    const tagName = el.tagName.toUpperCase();

    if (tagName === "A" || tagName === "BUTTON") {
      content = el.getAttribute("aria-label") || el.title || el.innerText || el.textContent;
    } else if (tagName === "IMG") {
      content = el.alt || el.getAttribute("aria-label") || el.title || "";
    } else if (tagName === "INPUT" || tagName === "TEXTAREA") {
      const label = el.labels && el.labels[0] ? el.labels[0].innerText : "";
      content = label || el.placeholder || el.value || "";
    } else if (tagName === "P" || tagName === "SPAN" || tagName === "LI" || /^H[1-6]$/.test(tagName)) {
      content = el.innerText || el.textContent;
    } else {
      if (el.getAttribute("aria-label")) {
        content = el.getAttribute("aria-label");
      } else if (el.title) {
        content = el.title;
      }
    }

    if (!content) return null;
    const cleanContent = content.trim().replace(/\s+/g, " ");
    if (cleanContent.length < 2) return null;

    return { text: cleanContent, element: el };
  };

  // Toggle Main Assistant State
  const toggleVoiceAssistant = useCallback(() => {
    setIsEnabled((prev) => {
      const nextState = !prev;
      if (nextState) {
        playAudioChime("on");
      } else {
        stopSpeech();
        playAudioChime("off");
      }
      return nextState;
    });
  }, [playAudioChime, stopSpeech]);

  // Global Keyboard Shortcuts (Alt+A, Alt+R, Alt+S, Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && (e.code === "KeyA" || e.key === "a" || e.key === "A")) {
        e.preventDefault();
        toggleVoiceAssistant();
      } else if (e.altKey && (e.code === "KeyR" || e.key === "r" || e.key === "R")) {
        e.preventDefault();
        startPageReading();
      } else if (e.key === "Escape" || (e.altKey && (e.code === "KeyS" || e.key === "s" || e.key === "S"))) {
        stopSpeech();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleVoiceAssistant, startPageReading, stopSpeech]);

  // Mouseover & Focus In Interactive Reader when Assistant is Enabled
  useEffect(() => {
    if (!isEnabled || isReadingPage) return;

    const handleMouseOver = (e) => {
      const details = getSpeakableDetails(e.target);
      if (details) {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
          speakText(details.text, details.element);
        }, 150);
      }
    };

    const handleFocusIn = (e) => {
      const details = getSpeakableDetails(e.target);
      if (details) {
        speakText(details.text, details.element);
      }
    };

    const handleMouseOut = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseout", handleMouseOut);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseout", handleMouseOut);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [isEnabled, isReadingPage, speakText]);

  // Cycle Speed Multipliers
  const cycleRate = () => {
    const rates = [0.8, 1, 1.25, 1.5];
    const nextIdx = (rates.indexOf(rate) + 1) % rates.length;
    setRate(rates[nextIdx]);
    playAudioChime("click");
  };

  // Filtered Languages for Settings Modal
  const filteredLanguages = useMemo(() => {
    return ALL_LANGUAGES.filter((lang) => {
      const matchesCategory = activeTab === "All" || lang.category === activeTab;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        lang.name.toLowerCase().includes(q) ||
        lang.native.toLowerCase().includes(q) ||
        lang.code.toLowerCase().includes(q) ||
        lang.bcp47.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activeTab, searchQuery]);

  return (
    <>
      {/* Live ARIA region for Native Screen Readers */}
      <div className={styles.srOnly} aria-live="assertive" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Main Voice Assistant Floating Capsule Container */}
      <div className={styles.voiceWidgetContainer}>
        {/* Active Spoken Status Banner */}
        {currentlySpeaking && (
          <div className={styles.statusBanner} role="status">
            <div className={styles.statusHeader}>
              <div className={styles.statusLabel}>
                <Mic size={12} className="animate-pulse" />
                <span>Sanmora Voice Reader</span>
              </div>
              {isReadingPage && (
                <span className={styles.progressBadge}>
                  Reading Page ({readingProgress.current}/{readingProgress.total})
                </span>
              )}
            </div>
            <div className={styles.statusText}>{currentlySpeaking}</div>
          </div>
        )}

        {/* Floating Control Toolbar Bar */}
        {(isEnabled || isReadingPage) && (
          <div className={styles.controlBar} role="toolbar" aria-label="Voice Controls Toolbar">
            <button
              className={`${styles.readPageBtn} ${isReadingPage ? styles.readingActive : ""}`}
              onClick={startPageReading}
              title={
                isReadingPage
                  ? isPaused
                    ? "Resume Page Reading (Alt+R)"
                    : "Pause Page Reading (Alt+R)"
                  : "Read Full Page Text (Alt+R)"
              }
              aria-label="Read Page Text"
            >
              {isReadingPage ? (
                isPaused ? (
                  <>
                    <Play size={13} /> Resume
                  </>
                ) : (
                  <>
                    <Pause size={13} /> Pause
                  </>
                )
              ) : (
                <>
                  <Play size={13} /> Read Page
                </>
              )}
            </button>

            {isReadingPage && (
              <button
                className={styles.stopBtn}
                onClick={stopSpeech}
                title="Stop Audio Playback (Escape or Alt+S)"
                aria-label="Stop Playback"
              >
                <Square size={12} />
              </button>
            )}

            <button
              className={styles.rateSelector}
              onClick={cycleRate}
              title="Change Speech Speed"
              aria-label={`Speech rate ${rate}x`}
            >
              {rate}x
            </button>

            <button
              className={styles.controlBtn}
              onClick={() => {
                playAudioChime("click");
                setShowSettings(true);
              }}
              title="Voice & Language Settings"
              aria-label="Open Voice Settings"
            >
              <Settings size={14} />
            </button>

            <button
              className={styles.controlBtn}
              onClick={() => {
                playAudioChime("click");
                setShowHelp(true);
              }}
              title="Blind Accessibility Guide (Alt+H)"
              aria-label="Open Accessibility Help"
            >
              <HelpCircle size={14} />
            </button>
          </div>
        )}

        {/* Main Floating Capsule Trigger Pill */}
        <button
          className={`${styles.triggerBtn} ${isEnabled ? styles.active : ""}`}
          onClick={toggleVoiceAssistant}
          aria-label={isEnabled ? "Disable Voice Assistant (Alt+A)" : "Enable Voice Assistant for Visually Impaired (Alt+A)"}
          title={isEnabled ? "Turn Off Voice Assistant (Alt+A)" : "Turn On Voice Assistant for Visually Impaired (Alt+A)"}
        >
          <div className={styles.iconWrapper}>
            {isEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </div>
          <span>{isEnabled ? "Voice Active" : "Voice Assist"}</span>
          <span className={styles.pulseRing} />
          <span className={styles.hotkeyBadge}>Alt+A</span>
        </button>
      </div>

      {/* Voice Reader & Multi-Language Settings Modal */}
      {showSettings && (
        <div className={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="settings-title"
          >
            <div className={styles.modalHeader}>
              <h3 id="settings-title" className={styles.modalTitle}>
                <Sliders size={20} /> Voice Reader Settings
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>
                  Select Language (in {selectedLang.native}):
                </span>
                <span className={styles.countBadge}>{ALL_LANGUAGES.length} languages</span>
              </div>

              <div className={styles.tabsContainer}>
                <button
                  className={`${styles.tabBtn} ${activeTab === "All" ? styles.activeTab : ""}`}
                  onClick={() => setActiveTab("All")}
                >
                  <Globe size={13} /> All
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === "India" ? styles.activeTab : ""}`}
                  onClick={() => setActiveTab("India")}
                >
                  🇮🇳 India
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === "Africa" ? styles.activeTab : ""}`}
                  onClick={() => setActiveTab("Africa")}
                >
                  🌍 Africa
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === "Global" ? styles.activeTab : ""}`}
                  onClick={() => setActiveTab("Global")}
                >
                  🌐 Global
                </button>
              </div>

              <div className={styles.searchWrapper}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search language (Hindi, Gujarati, Zulu, Afrikaans, Swahili, Amharic...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className={styles.clearSearchBtn}
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className={styles.langGrid}>
                {filteredLanguages.map((lang) => {
                  const isSelected = selectedLang.code === lang.code;
                  const displayName =
                    lang.name === lang.native || lang.name.startsWith(lang.native)
                      ? lang.name
                      : `${lang.name} (${lang.native})`;
                  return (
                    <button
                      key={lang.code}
                      className={`${styles.langCard} ${isSelected ? styles.selectedLang : ""}`}
                      onClick={() => {
                        setSelectedLang(lang);
                        syncDOMTranslation(lang.code);
                        playAudioChime("click");
                      }}
                    >
                      <div className={styles.langMeta}>
                        <span className={styles.regionBadge}>{lang.regionBadge}</span>
                        <div>
                          <div className={styles.langNameTitle}>{displayName}</div>
                          <div className={styles.langSubcode}>
                            {lang.code.toUpperCase()} • {lang.bcp47}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check size={18} className={styles.checkIcon} />}
                    </button>
                  );
                })}
              </div>

              <div className={styles.settingGroup}>
                <label className={styles.settingLabel} htmlFor="pitch-slider">
                  <span>Voice Pitch: {pitch}</span>
                </label>
                <input
                  id="pitch-slider"
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className={styles.settingSlider}
                />
              </div>

              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>
                  <span className="flex items-center gap-2">
                    <Bell size={16} /> Sound Chimes & Audio Cues
                  </span>
                  <input
                    type="checkbox"
                    checked={soundEffects}
                    onChange={(e) => setSoundEffects(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 cursor-pointer"
                  />
                </label>
              </div>

              <button
                className={styles.saveBtn}
                onClick={() => {
                  playAudioChime("click");
                  setShowSettings(false);
                  speakText(`Voice settings saved for ${selectedLang.name}.`);
                }}
              >
                <Check size={18} /> Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blind Accessibility Guide Modal */}
      {showHelp && (
        <div className={styles.modalOverlay} onClick={() => setShowHelp(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="help-title"
          >
            <div className={styles.modalHeader}>
              <h3 id="help-title" className={styles.modalTitle}>
                <Eye size={20} /> Blind Accessibility Guide
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setShowHelp(false)}
                aria-label="Close help"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className="text-sm text-slate-300">
                Sanmora website is fully optimized for blind and visually impaired visitors. Use these shortcut keys & gestures:
              </p>

              <ul className={styles.helpList}>
                <li className={styles.helpItem}>
                  <span className={styles.helpBadge}>Alt + A</span>
                  <span>Toggle Voice Assistant ON / OFF from anywhere on the page.</span>
                </li>
                <li className={styles.helpItem}>
                  <span className={styles.helpBadge}>Alt + R</span>
                  <span>Start / Pause automatic full-page speech reader.</span>
                </li>
                <li className={styles.helpItem}>
                  <span className={styles.helpBadge}>Escape / Alt+S</span>
                  <span>Stop audio speech playback immediately.</span>
                </li>
                <li className={styles.helpItem}>
                  <span className={styles.helpBadge}>Hover / Focus</span>
                  <span>Move your mouse or press Tab key to read out any text, button, or link out loud.</span>
                </li>
              </ul>

              <button
                className={styles.saveBtn}
                onClick={() => {
                  playAudioChime("click");
                  setShowHelp(false);
                }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
