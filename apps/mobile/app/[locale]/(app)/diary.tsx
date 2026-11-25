import { privateMetadata } from "@/seo/metadata";
import { MyDiary } from "@/features/diary/MyDiary";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <MyDiary />;
}
