"use client";

import { useEffect, useRef, useCallback } from "react";

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-v3-script";

/**
 * Custom hook to manage Google reCAPTCHA v3 script loading and token generation.
 */
export function useRecaptcha() {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const isLoadedRef = useRef(false);

  useEffect(() => {
    if (!siteKey || typeof window === "undefined") return;

    if (document.getElementById(RECAPTCHA_SCRIPT_ID)) {
      isLoadedRef.current = true;
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      isLoadedRef.current = true;
    };
    script.onerror = () => {
      console.warn("[reCAPTCHA Warning] Failed to load Google reCAPTCHA v3 script.");
    };

    document.head.appendChild(script);
  }, [siteKey]);

  /**
   * Generates a fresh reCAPTCHA v3 token for a given action name.
   */
  const executeRecaptcha = useCallback(
    async (action = "submit") => {
      if (!siteKey) {
        // In local development or if site key is omitted
        return "dev-local-recaptcha-token";
      }

      if (typeof window === "undefined" || !window.grecaptcha) {
        // Wait up to 2 seconds for script to load
        let attempts = 0;
        while ((!window || !window.grecaptcha) && attempts < 20) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }
      }

      if (!window?.grecaptcha) {
        console.warn("[reCAPTCHA] grecaptcha object not available. Submitting without token.");
        return "";
      }

      return new Promise((resolve) => {
        window.grecaptcha.ready(async () => {
          try {
            const token = await window.grecaptcha.execute(siteKey, { action });
            resolve(token);
          } catch (err) {
            console.error("[reCAPTCHA Execution Error]", err);
            resolve("");
          }
        });
      });
    },
    [siteKey]
  );

  return { executeRecaptcha, isConfigured: Boolean(siteKey) };
}

