import { privateMetadata } from "@/seo/metadata";
import { TitlePage } from "@/features/diary/TitlePage";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <TitlePage />;
}
