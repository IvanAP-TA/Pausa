import { privateMetadata } from "@/seo/metadata";
import { ImportsManage } from "@/features/import/ImportsManage";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <ImportsManage />;
}
