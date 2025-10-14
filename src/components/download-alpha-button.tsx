import Link from "next/link";
import { Icons } from "./icons";
import { Button } from "./ui/button";

export async function DownloadAlphaButton() {
  // Без внешних источников: ведём на регистрацию/якорь
  return (
    <Link href="#signup">
      <Button className="flex rounded-none text-sm sm:text-base" variant="default">
        <Icons.apple className="size-3 sm:size-4" />
        <span className="font-medium text-sm">Sign up</span>
      </Button>
    </Link>
  );
}
