import { useUiLanguage } from "@/lib/ui-language/store";
import { GAME_CONTROL_MESSAGES } from "@/lib/ui-language/game-control-messages";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation shown when the player tries to leave a stage in progress.
 * Premium copy — never dramatic.
 */
export function ExitConfirmDialog({ open, onCancel, onConfirm }: Props) {
  const { language, direction } = useUiLanguage();
  const copy = GAME_CONTROL_MESSAGES[language];
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent dir={direction} className="border-amber-500/30">
        <AlertDialogHeader className="sm:text-start">
          <AlertDialogTitle className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
            {copy.exitTitle}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-7 text-slate-300">
            {copy.exitDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} className="border-slate-700">
            {copy.continue}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-rose-500 text-white hover:bg-rose-400"
          >
            {copy.exit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
