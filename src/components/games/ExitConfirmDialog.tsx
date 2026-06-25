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
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent dir="rtl" className="border-amber-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
            الخروج من التحدي؟
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-7 text-slate-300">
            إذا خرجت الآن ستفقد تقدمك الحالي في هذه المرحلة.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} className="border-slate-700">
            متابعة التحدي
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-rose-500 text-white hover:bg-rose-400"
          >
            خروج
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
