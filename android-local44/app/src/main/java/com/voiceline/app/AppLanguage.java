package com.voiceline.app;

/** Only app-owned Android text follows the in-app choice. System UI uses Android's language. */
final class AppLanguage {
    private AppLanguage() {}
    private static volatile String language = "ko";
    static void set(String value) { if ("ko".equals(value) || "en".equals(value)) language = value; }
    static String pick(String korean, String english) { return "en".equals(language) ? english : korean; }
}
