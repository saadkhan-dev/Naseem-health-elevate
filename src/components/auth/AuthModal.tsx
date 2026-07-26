import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode === "login" ? "Welcome back" : "Create an account"}</DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Sign in to book appointments and manage your health journey."
              : "Register to start booking appointments with Dr. Naseem Alam."}
          </DialogDescription>
        </DialogHeader>
        {mode === "login" ? (
          <LoginForm onSuccess={() => onOpenChange(false)} />
        ) : (
          <RegisterForm onSuccess={() => onOpenChange(false)} />
        )}
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button onClick={() => setMode("register")} className="font-medium text-primary hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setMode("login")} className="font-medium text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
