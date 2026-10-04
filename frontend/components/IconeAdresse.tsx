import { BriefcaseBusiness, House, MapPin, Star } from "lucide-react";

export function IconeAdresse({
  kind,
  size = 22,
}: {
  kind?: string;
  size?: number;
}) {
  const Icon =
    kind === "HOME"
      ? House
      : kind === "WORK"
        ? BriefcaseBusiness
        : kind === "OTHER"
          ? Star
          : MapPin;
  return (
    <Icon size={size} aria-hidden="true" className="shrink-0 text-gray-500" />
  );
}
