import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Phone, Delete } from "lucide-react";

interface DialpadProps {
  onCall: (number: string) => void;
}

export function Dialpad({ onCall }: DialpadProps) {
  const [number, setNumber] = useState("");

  const handleNumberClick = (digit: string) => {
    setNumber(prev => prev + digit);
  };

  const handleDelete = () => {
    setNumber(prev => prev.slice(0, -1));
  };

  const handleCall = () => {
    if (number) {
      onCall(number);
      setNumber("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <input
          type="text"
          value={number}
          readOnly
          className="w-full text-2xl text-center bg-transparent border-none focus:outline-none"
          placeholder="Enter number"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          "1", "2", "3",
          "4", "5", "6",
          "7", "8", "9",
          "*", "0", "#"
        ].map((digit) => (
          <Button
            key={digit}
            variant="outline"
            className="h-12 text-lg"
            onClick={() => handleNumberClick(digit)}
          >
            {digit}
          </Button>
        ))}
      </div>
      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleDelete}
        >
          <Delete className="h-4 w-4" />
        </Button>
        <Button
          variant="default"
          className="flex-1"
          onClick={handleCall}
        >
          <Phone className="h-4 w-4 mr-2" />
          Call
        </Button>
      </div>
    </div>
  );
}
