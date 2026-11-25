import { Platform } from "react-native";
import { SITE_URL } from "@/seo/site";

/** Where invite links point: the page the person is on (web, so dev and production both work), the real site on native. */
export const siteOrigin = () => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : SITE_URL);

export const inviteLink = (locale: string, code: string) => `${siteOrigin()}/${locale}/join/${code}`;
