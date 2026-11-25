import { privateMetadata } from "@/seo/metadata";
import { Notifications } from "@/features/diary/Notifications";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Notifications />;
}
