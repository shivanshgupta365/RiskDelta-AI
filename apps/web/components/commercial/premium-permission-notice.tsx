import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsoleChip, ConsoleKicker, ConsolePanel, ConsoleRow, ConsoleSurface } from "@/components/ui/console-kit";

export function PremiumPermissionNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <ConsoleSurface className="p-6 md:p-8">
        <div className="flex flex-col gap-5 border-b border-[#1b1f1b] pb-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <ConsoleKicker>Commercial admin access required</ConsoleKicker>
            <h1 className="max-w-[14ch] font-sans text-[2.2rem] font-semibold tracking-[-0.05em] text-[#f5f7f4] md:text-[3rem]">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-[#a0a8a0]">{description}</p>
          </div>
          <div className="flex items-center gap-3">
            <ConsoleChip tone="warning">ADMIN</ConsoleChip>
            <ConsoleChip tone="neutral">OWNER</ConsoleChip>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <ConsolePanel tone="subtle">
            <div className="flex items-center gap-3">
              <ShieldAlert className="size-4 text-[#f5b546]" />
              <ConsoleKicker>Why this is blocked</ConsoleKicker>
            </div>
            <div className="mt-4 space-y-3">
              <ConsoleRow>This workspace is running with commercial feature support, but this account does not meet the minimum premium role.</ConsoleRow>
              <ConsoleRow>Premium operator surfaces are restricted to `ADMIN` and `OWNER` so public or lower-privilege members cannot alter policy, controls, incident state, or managed integrations.</ConsoleRow>
            </div>
          </ConsolePanel>

          <ConsolePanel tone="warning">
            <ConsoleKicker>What you can use now</ConsoleKicker>
            <div className="mt-4 space-y-3">
              <p className="text-sm leading-7 text-[#f5f7f4]">
                The evidence-first community-safe workspace remains available through Overview, TraceVault, Applications, Docs, Quickstart, and Settings.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="sm" className="rounded-none">
                  <Link href="/app/tracevault">Open TraceVault</Link>
                </Button>
                <Button asChild variant="secondary" size="sm" className="rounded-none border-[#1b1f1b] bg-[#111411] hover:bg-[#111411]">
                  <Link href="/app/overview">Back to Overview</Link>
                </Button>
              </div>
            </div>
          </ConsolePanel>
        </div>
      </ConsoleSurface>
    </div>
  );
}
