import { privateMetadata } from "@/seo/metadata";
import { SettingsPage } from "@/features/people/Settings";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <SettingsPage />;
}
