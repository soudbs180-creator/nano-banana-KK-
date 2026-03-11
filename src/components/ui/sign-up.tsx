import { cn } from "@/lib/utils";
import React, {
  Children,
  createContext,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader,
  Lock,
  Mail,
  PartyPopper,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useInView, type Transition, type Variants } from "framer-motion";
import confetti from "canvas-confetti";
import type {
  CreateTypes as ConfettiInstance,
  GlobalOptions as ConfettiGlobalOptions,
  Options as ConfettiOptions,
} from "canvas-confetti";

type Api = { fire: (options?: ConfettiOptions) => void };
export type ConfettiRef = Api | null;
const ConfettiContext = createContext<Api>({} as Api);

const Confetti = forwardRef<
  ConfettiRef,
  React.ComponentPropsWithRef<"canvas"> & {
    options?: ConfettiOptions;
    globalOptions?: ConfettiGlobalOptions;
    manualstart?: boolean;
  }
>((props, ref) => {
  const {
    options,
    globalOptions = { resize: true, useWorker: true },
    manualstart = false,
    ...rest
  } = props;

  const instanceRef = useRef<ConfettiInstance | null>(null);
  const canvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node !== null) {
        if (instanceRef.current) return;
        instanceRef.current = confetti.create(node, { ...globalOptions, resize: true });
      } else if (instanceRef.current) {
        instanceRef.current.reset();
        instanceRef.current = null;
      }
    },
    [globalOptions]
  );

  const fire = useCallback((opts = {}) => instanceRef.current?.({ ...options, ...opts }), [options]);
  const api = useMemo(() => ({ fire }), [fire]);

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    if (!manualstart) fire();
  }, [manualstart, fire]);

  return <canvas ref={canvasRef} {...rest} />;
});
Confetti.displayName = "Confetti";

type TextLoopProps = {
  children: React.ReactNode[];
  className?: string;
  interval?: number;
  transition?: Transition;
  variants?: Variants;
  onIndexChange?: (index: number) => void;
  stopOnEnd?: boolean;
};

function TextLoop({
  children,
  className,
  interval = 1.5,
  transition = { duration: 0.25 },
  variants,
  onIndexChange,
  stopOnEnd = false,
}: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = Children.toArray(children);

  useEffect(() => {
    const intervalMs = interval * 1000;
    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        if (stopOnEnd && current === items.length - 1) {
          clearInterval(timer);
          return current;
        }
        const next = (current + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange, stopOnEnd]);

  const motionVariants: Variants = {
    initial: { y: 16, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -16, opacity: 0 },
  };

  return (
    <div className={cn("relative inline-block whitespace-nowrap", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentIndex}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
          variants={variants || motionVariants}
        >
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  variant?: { hidden: { y: number }; visible: { y: number } };
  duration?: number;
  delay?: number;
  yOffset?: number;
  inView?: boolean;
  inViewMargin?: string;
  blur?: string;
}

function BlurFade({
  children,
  className,
  variant,
  duration = 0.35,
  delay = 0,
  yOffset = 6,
  inView = true,
  inViewMargin = "-30px",
  blur = "4px",
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin as any });
  const isInView = !inView || inViewResult;

  const defaultVariants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: 0, opacity: 1, filter: "blur(0px)" },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      exit="hidden"
      variants={variant || defaultVariants}
      transition={{ delay, duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const glassButtonVariants = cva(
  "relative isolate cursor-pointer rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      size: {
        default: "text-base font-medium",
        sm: "text-sm font-medium",
        lg: "text-lg font-medium",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const glassButtonTextVariants = cva("relative block select-none tracking-tight", {
  variants: {
    size: {
      default: "px-6 py-3",
      sm: "px-4 py-2",
      lg: "px-8 py-4",
      icon: "flex h-10 w-10 items-center justify-center",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, onClick, ...props }, ref) => {
    return (
      <div className={cn("glass-button-wrap rounded-full relative", className)}>
        <button
          className={cn("glass-button relative z-10", glassButtonVariants({ size }))}
          ref={ref}
          onClick={onClick}
          {...props}
        >
          <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>{children}</span>
        </button>
        <div className="glass-button-shadow rounded-full pointer-events-none" />
      </div>
    );
  }
);
GlassButton.displayName = "GlassButton";

const GradientBackground = () => (
  <>
    <style>
      {`
      @keyframes auth-float-1 {
        0% { transform: translate(0, 0); }
        50% { transform: translate(-14px, 12px); }
        100% { transform: translate(0, 0); }
      }
      @keyframes auth-float-2 {
        0% { transform: translate(0, 0); }
        50% { transform: translate(14px, -10px); }
        100% { transform: translate(0, 0); }
      }
      `}
    </style>
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1280 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id="auth_grad_1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="auth_grad_2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#FB7185" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id="auth_grad_3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
        </radialGradient>
        <filter id="auth_blur_1" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="50" />
        </filter>
      </defs>

      <g style={{ animation: "auth-float-1 20s ease-in-out infinite" }}>
        <ellipse
          cx="220"
          cy="640"
          rx="320"
          ry="220"
          fill="url(#auth_grad_1)"
          filter="url(#auth_blur_1)"
          transform="rotate(-20 220 640)"
        />
        <rect
          x="880"
          y="100"
          width="340"
          height="240"
          rx="100"
          fill="url(#auth_grad_2)"
          filter="url(#auth_blur_1)"
          transform="rotate(14 1050 220)"
        />
      </g>

      <g style={{ animation: "auth-float-2 24s ease-in-out infinite" }}>
        <circle cx="1100" cy="660" r="220" fill="url(#auth_grad_3)" />
      </g>
    </svg>
  </>
);

const BubbleFace = ({ className, children }: { className?: string; children?: React.ReactNode }) => {
  return (
    <div className={cn("relative rounded-full", className)}>
      <span className="absolute left-[34%] top-[42%] h-2.5 w-2.5 rounded-full bg-slate-900" />
      <span className="absolute right-[34%] top-[42%] h-2.5 w-2.5 rounded-full bg-slate-900" />
      <span className="absolute left-1/2 top-[60%] h-2 w-6 -translate-x-1/2 rounded-b-full border-b-2 border-slate-700" />
      {children}
    </div>
  );
};

const modalSteps = ["验证账号信息...", "检查账户状态...", "正在进入系统..."];

export type AuthActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

export interface AuthComponentProps {
  logo?: React.ReactNode;
  brandName?: string;
  onLogin?: (params: { email: string; password: string }) => Promise<AuthActionResult>;
  onRegister?: (params: { email: string; password: string }) => Promise<AuthActionResult>;
  onForgotPassword?: (email: string) => Promise<AuthActionResult>;
  onTempLogin?: () => Promise<AuthActionResult | void>;
  tempUserLabel?: string;
}

type AuthMode = "login" | "register";
type RegisterStep = "email" | "password" | "confirmPassword";

type ModalStatus = "closed" | "loading" | "error" | "success";

const DefaultLogo = () => (
  <div className="rounded-xl bg-sky-500/90 p-2 text-white shadow-lg shadow-sky-500/30">
    <Sparkles className="h-4 w-4" />
  </div>
);

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export const AuthComponent = ({
  logo = <DefaultLogo />,
  brandName = "KK 创作平台",
  onLogin,
  onRegister,
  onForgotPassword,
  onTempLogin,
  tempUserLabel = "临时用户登录（24 小时体验）",
}: AuthComponentProps) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [registerStep, setRegisterStep] = useState<RegisterStep>("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [modalStatus, setModalStatus] = useState<ModalStatus>("closed");
  const [modalMessage, setModalMessage] = useState("");
  const [modalErrorMessage, setModalErrorMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const confettiRef = useRef<ConfettiRef>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  const isEmailValid = EMAIL_RE.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isConfirmPasswordValid = confirmPassword.length >= 6;

  const fireSideCanons = useCallback(() => {
    const fire = confettiRef.current?.fire;
    if (!fire) return;

    const defaults = { startVelocity: 28, spread: 360, ticks: 64, zIndex: 100 };
    const particleCount = 48;

    fire({ ...defaults, particleCount, origin: { x: 0, y: 1 }, angle: 60 });
    fire({ ...defaults, particleCount, origin: { x: 1, y: 1 }, angle: 120 });
  }, []);

  useEffect(() => {
    if (mode !== "register") return;

    if (registerStep === "password") {
      setTimeout(() => passwordInputRef.current?.focus(), 120);
    }

    if (registerStep === "confirmPassword") {
      setTimeout(() => confirmPasswordInputRef.current?.focus(), 120);
    }
  }, [registerStep, mode]);

  const resetModal = () => {
    setModalStatus("closed");
    setModalErrorMessage("");
    setModalMessage("");
    setIsSubmitting(false);
  };

  const runAuthAction = async (
    action: () => Promise<AuthActionResult | void>,
    fallbackSuccessMessage: string
  ) => {
    setIsSubmitting(true);
    setModalStatus("loading");

    try {
      const result = await action();
      if (result && "ok" in result && !result.ok) {
        setModalErrorMessage(result.error || "操作失败，请重试");
        setModalStatus("error");
        return;
      }

      setModalMessage(
        (result && "message" in result && result.message) || fallbackSuccessMessage
      );
      setModalStatus("success");
      fireSideCanons();
    } catch (error) {
      setModalErrorMessage(
        error instanceof Error ? error.message : "出现未知错误，请稍后再试"
      );
      setModalStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModeSwitch = (nextMode: AuthMode) => {
    setMode(nextMode);
    setRegisterStep("email");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    resetModal();
  };

  const handleProgressStep = () => {
    if (mode === "register") {
      if (registerStep === "email") {
        if (!isEmailValid) {
          setModalErrorMessage("请输入正确的邮箱地址");
          setModalStatus("error");
          return;
        }
        setRegisterStep("password");
        return;
      }

      if (registerStep === "password") {
        if (!isPasswordValid) {
          setModalErrorMessage("密码长度至少 6 位");
          setModalStatus("error");
          return;
        }
        setRegisterStep("confirmPassword");
      }
      return;
    }

    if (!isEmailValid) {
      setModalErrorMessage("请输入正确的邮箱地址");
      setModalStatus("error");
      return;
    }

    if (!isPasswordValid) {
      setModalErrorMessage("请输入登录密码");
      setModalStatus("error");
      return;
    }

    runAuthAction(
      () =>
        onLogin?.({
          email: email.trim(),
          password,
        }) || Promise.resolve({ ok: true, message: "登录成功" }),
      "登录成功"
    );
  };

  const handleGoBack = () => {
    if (registerStep === "confirmPassword") {
      setRegisterStep("password");
      setConfirmPassword("");
      return;
    }

    if (registerStep === "password") {
      setRegisterStep("email");
    }
  };

  const handleFinalSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (isSubmitting || modalStatus === "loading") return;

    if (mode === "login") {
      handleProgressStep();
      return;
    }

    if (registerStep !== "confirmPassword") {
      handleProgressStep();
      return;
    }

    if (!isPasswordValid || !isConfirmPasswordValid) {
      setModalErrorMessage("密码长度至少 6 位");
      setModalStatus("error");
      return;
    }

    if (password !== confirmPassword) {
      setModalErrorMessage("两次输入的密码不一致");
      setModalStatus("error");
      return;
    }

    runAuthAction(
      () =>
        onRegister?.({
          email: email.trim(),
          password,
        }) || Promise.resolve({ ok: true, message: "注册成功" }),
      "注册成功"
    );
  };

  const handleForgotPassword = () => {
    if (!isEmailValid) {
      setModalErrorMessage("先输入可用邮箱，再发送重置链接");
      setModalStatus("error");
      return;
    }

    runAuthAction(
      () =>
        onForgotPassword?.(email.trim()) ||
        Promise.resolve({ ok: true, message: "重置邮件已发送" }),
      "重置邮件已发送"
    );
  };

  const handleTempLogin = () => {
    runAuthAction(
      () => onTempLogin?.() || Promise.resolve({ ok: true, message: "已登录临时账号" }),
      "已登录临时账号"
    );
  };

  const pageTitle =
    mode === "login"
      ? "欢迎回来"
      : registerStep === "email"
        ? "创建你的账号"
        : registerStep === "password"
          ? "设置登录密码"
          : "确认密码";

  const pageSubtitle =
    mode === "login"
      ? "登录后继续使用 KK 创作平台"
      : registerStep === "email"
        ? "输入邮箱开始注册流程"
        : registerStep === "password"
          ? "密码至少 6 位，建议包含字母和数字"
          : "确认密码后完成注册";

  const Modal = () => (
    <AnimatePresence>
      {modalStatus !== "closed" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative mx-3 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-8 text-slate-100"
          >
            {(modalStatus === "error" || modalStatus === "success") && (
              <button
                onClick={resetModal}
                className="absolute right-2 top-2 rounded-full p-1 text-slate-400 transition hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {modalStatus === "error" && (
              <>
                <AlertCircle className="h-12 w-12 text-rose-400" />
                <p className="text-center text-base font-medium">{modalErrorMessage}</p>
                <GlassButton onClick={resetModal} size="sm" className="mt-4">
                  我知道了
                </GlassButton>
              </>
            )}

            {modalStatus === "loading" && (
              <TextLoop interval={1.2} stopOnEnd={false}>
                {modalSteps.map((step, index) => (
                  <div key={index} className="flex flex-col items-center gap-4">
                    <Loader className="h-12 w-12 animate-spin text-sky-400" />
                    <p className="text-center text-base font-medium">{step}</p>
                  </div>
                ))}
              </TextLoop>
            )}

            {modalStatus === "success" && (
              <div className="flex flex-col items-center gap-4">
                <PartyPopper className="h-12 w-12 text-emerald-400" />
                <p className="text-center text-base font-medium">{modalMessage || "操作成功"}</p>
                <GlassButton onClick={resetModal} size="sm" className="mt-4">
                  继续
                </GlassButton>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <ConfettiContext.Provider value={useMemo(() => ({ fire: () => undefined }), [])}>
      <div className="relative flex min-h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
        <style>{`
          .auth-grid-bg {
            background-image:
              linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px);
            background-size: 56px 56px;
          }
          .glass-button-wrap {
            transition: transform 220ms ease;
          }
          .glass-button-wrap:hover {
            transform: translateY(-1px);
          }
          .glass-button-shadow {
            position: absolute;
            inset: -4px;
            filter: blur(10px);
            opacity: 0.45;
            background: radial-gradient(circle at 50% 40%, rgba(125, 211, 252, 0.35), transparent 70%);
          }
          .glass-button {
            border: 1px solid rgba(148, 163, 184, 0.32);
            background: linear-gradient(120deg, rgba(15, 23, 42, 0.75), rgba(30, 41, 59, 0.6));
            backdrop-filter: blur(10px);
          }
          .glass-input-wrap {
            position: relative;
            border-radius: 9999px;
          }
          .glass-input {
            display: flex;
            width: 100%;
            align-items: center;
            gap: 0.5rem;
            border-radius: 9999px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: linear-gradient(120deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.62));
            box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.25);
            backdrop-filter: blur(8px);
          }
          .glass-input:focus-within {
            border-color: rgba(56, 189, 248, 0.7);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2), inset 0 1px 0 rgba(148, 163, 184, 0.3);
          }
        `}</style>

        <Confetti
          ref={confettiRef}
          manualstart
          className="pointer-events-none fixed left-0 top-0 z-[999] h-full w-full"
        />
        <Modal />

        <div className="absolute inset-0 z-0">
          <div className="auth-grid-bg absolute inset-0" />
          <GradientBackground />
        </div>

        <div className="fixed left-6 top-6 z-20 flex items-center gap-3">
          {logo}
          <div>
            <h1 className="text-[42px] font-extrabold tracking-tight text-white/95">{brandName}</h1>
            <p className="text-base text-slate-300">下一代智能创作工作台</p>
          </div>
        </div>

        <div className="relative z-10 flex min-h-screen w-full items-center justify-center lg:justify-end px-4 sm:px-10 lg:px-16 pt-16 sm:pt-24 pb-8 sm:pb-0">
          <div className="hidden h-[420px] w-[420px] items-center justify-center lg:flex lg:absolute lg:left-12 lg:top-1/2 lg:-translate-y-1/2">
            <div className="relative h-[360px] w-[360px] rounded-2xl border-4 border-rose-400/90">
              <BubbleFace className="absolute left-4 top-24 h-40 w-40 bg-gradient-to-br from-amber-200 to-orange-400 shadow-2xl shadow-orange-500/35" />
              <BubbleFace className="absolute right-12 top-4 h-32 w-32 bg-gradient-to-br from-blue-200 to-blue-500 shadow-2xl shadow-blue-500/35" />
              <BubbleFace className="absolute bottom-14 right-5 h-24 w-24 bg-gradient-to-br from-violet-200 to-violet-500 shadow-2xl shadow-violet-500/35" />
            </div>
          </div>

          <fieldset
            disabled={isSubmitting}
            className="w-full max-w-sm sm:max-w-[420px] rounded-3xl border border-slate-600/50 bg-slate-950/70 p-6 sm:p-8 shadow-[0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl"
          >
            <div className="mb-6 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 p-1 text-sm">
              <button
                type="button"
                onClick={() => handleModeSwitch("login")}
                className={cn(
                  "h-9 flex-1 rounded-full transition",
                  mode === "login"
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/35"
                    : "text-slate-300 hover:text-white"
                )}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch("register")}
                className={cn(
                  "h-9 flex-1 rounded-full transition",
                  mode === "register"
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/35"
                    : "text-slate-300 hover:text-white"
                )}
              >
                注册
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${mode}-${registerStep}`}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -6, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <BlurFade className="mb-6 text-left">
                  <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">{pageTitle}</h2>
                  <p className="mt-2 text-sm text-slate-300">{pageSubtitle}</p>
                </BlurFade>

                <form onSubmit={handleFinalSubmit} className="space-y-5">
                  {(mode === "login" || registerStep === "email") && (
                    <BlurFade delay={0.03} className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">邮箱地址</label>
                      <div className="glass-input-wrap">
                        <div className="glass-input px-3 py-2.5">
                          <Mail className="h-4 w-4 text-slate-300" />
                          <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="请输入邮箱地址"
                            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
                            autoComplete="email"
                          />
                        </div>
                      </div>
                    </BlurFade>
                  )}

                  {(mode === "login" || registerStep === "password" || registerStep === "confirmPassword") && (
                    <BlurFade delay={0.07} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                          登录密码
                        </label>
                        {mode === "login" && (
                          <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-xs font-medium text-sky-300 hover:text-sky-200"
                          >
                            忘记密码？
                          </button>
                        )}
                      </div>

                      <div className="glass-input-wrap">
                        <div className="glass-input px-3 py-2.5">
                          <Lock className="h-4 w-4 text-slate-300" />
                          <input
                            ref={passwordInputRef}
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="请输入登录密码"
                            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
                            autoComplete={mode === "register" ? "new-password" : "current-password"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </BlurFade>
                  )}

                  {mode === "register" && registerStep === "confirmPassword" && (
                    <BlurFade delay={0.1} className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        确认密码
                      </label>
                      <div className="glass-input-wrap">
                        <div className="glass-input px-3 py-2.5">
                          <Lock className="h-4 w-4 text-slate-300" />
                          <input
                            ref={confirmPasswordInputRef}
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="请再次输入密码"
                            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((current) => !current)}
                            className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </BlurFade>
                  )}

                  <BlurFade delay={0.12}>
                    <GlassButton
                      type="submit"
                      className="w-full"
                      contentClassName="flex w-full items-center justify-center gap-2 text-white"
                    >
                      {isSubmitting ? <Loader className="h-4 w-4 animate-spin" /> : null}
                      <span>
                        {mode === "login"
                          ? "登录"
                          : registerStep === "confirmPassword"
                            ? "完成注册"
                            : "下一步"}
                      </span>
                      {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
                    </GlassButton>
                  </BlurFade>

                  {mode === "register" && registerStep !== "email" && (
                    <button
                      type="button"
                      onClick={handleGoBack}
                      className="flex items-center gap-1.5 text-sm text-slate-300 transition hover:text-white"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      返回上一步
                    </button>
                  )}
                </form>

                <BlurFade delay={0.18} className="mt-6 border-t border-slate-700/70 pt-5">
                  {mode === "login" ? (
                    <>
                      <p className="text-sm text-slate-300">
                        还没有账号？
                        <button
                          type="button"
                          onClick={() => handleModeSwitch("register")}
                          className="ml-1 font-semibold text-sky-300 hover:text-sky-200"
                        >
                          立即注册
                        </button>
                      </p>
                      <button
                        type="button"
                        onClick={handleTempLogin}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200 transition hover:bg-amber-500/20"
                      >
                        <User className="h-3.5 w-3.5" />
                        {tempUserLabel}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-slate-300">
                      已有账号？
                      <button
                        type="button"
                        onClick={() => handleModeSwitch("login")}
                        className="ml-1 font-semibold text-sky-300 hover:text-sky-200"
                      >
                        去登录
                      </button>
                    </p>
                  )}
                </BlurFade>
              </motion.div>
            </AnimatePresence>
          </fieldset>
        </div>
      </div>
    </ConfettiContext.Provider>
  );
};

export default AuthComponent;
