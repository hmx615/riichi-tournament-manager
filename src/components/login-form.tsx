"use client";

import { LockKeyhole, LogIn } from "lucide-react";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { status: "idle", message: "" };

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form className="login-form" action={action}>
      <input type="hidden" name="next" value={nextPath} />
      <div className="login-icon"><LockKeyhole size={24} /></div>
      <div><h1>管理员登录</h1><p>访客可直接浏览比赛；修改与录入需要管理员身份。</p></div>
      <label className="field"><span>账号</span><input name="username" autoComplete="username" required autoFocus /></label>
      <label className="field"><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>
      {state.status === "error" && <p className="form-message error">{state.message}</p>}
      <button className="button primary" type="submit" disabled={pending}><LogIn size={17} />{pending ? "正在验证" : "登录"}</button>
    </form>
  );
}
