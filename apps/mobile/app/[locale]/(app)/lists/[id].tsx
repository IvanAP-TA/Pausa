import { privateMetadata } from "@/seo/metadata";
import { ListDetail } from "@/features/lists/ListDetail";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <ListDetail />;
}
