"use client";

import { KeyRound, LogIn } from "lucide-react";
import { useActionState } from "react";
import {
  tutorialLoginAction,
  type TutorialLoginState,
} from "@/app/tutorials/login/actions";

const initialState: TutorialLoginState = { status: "idle", message: "" };

export function TutorialLoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(tutorialLoginAction, initialState);
  return (
    <form className="tutorial-login-card" action={action}>
      <input type="hidden" name="next" value={nextPath} />
      <div className="tutorial-login-mark"><KeyRound size={25} /></div>
      <div>
        <h1>轩轩的牌例筛选站</h1>
      </div>
      <label><span>账号</span><input name="username" autoComplete="username" required autoFocus /></label>
      <label><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>
      {state.status === "error" && <p className="tutorial-form-error">{state.message}</p>}
      <button type="submit" disabled={pending}><LogIn size={17} />{pending ? "正在验证" : "登录"}</button>
    </form>
  );
}
