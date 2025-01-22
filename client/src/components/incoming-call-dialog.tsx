import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PhoneCall, PhoneOff } from "lucide-react";

interface IncomingCallDialogProps {
  isOpen: boolean;
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallDialog({
  isOpen,
  callerName,
  onAccept,
  onReject,
}: IncomingCallDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => onReject()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Incoming Call</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center text-lg font-medium">
            {callerName} is calling...
          </p>
          <div className="flex justify-center gap-4">
            <Button
              onClick={onAccept}
              className="w-32"
              variant="default"
            >
              <PhoneCall className="mr-2 h-4 w-4" />
              Accept
            </Button>
            <Button
              onClick={onReject}
              className="w-32"
              variant="destructive"
            >
              <PhoneOff className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
