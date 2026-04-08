import { useState } from "react";
import { Film, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../services/auth";
import backgroundImage from "../assets/login-bg.png";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password, rememberMe);
      } else {
        await login(email, password, rememberMe);
      }
      navigate("/");
    } catch (err: any) {
      if (!isRegister && err.response?.status === 401) {
        setError("Email ou senha incorretos");
      } else if (isRegister && err.response?.status === 409) {
        setError("Email já cadastrado");
      } else if (isRegister && err.response?.status === 400) {
        setError("Preencha email e senha");
      } else if (err.message) {
        setError(err.message);
      } else {
        setError(isRegister ? "Ocorreu um erro ao criar conta" : "Ocorreu um erro ao fazer login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-black">
      {/* Background image with overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-black/60 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="bg-red-600 p-2 rounded-lg">
              <Film className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white text-3xl font-bold">MetFlix</h1>
          </div>

          {/* Welcome / Register Text */}
          <div className="text-center mb-8">
            <h2 className="text-white text-2xl mb-2">
              {isRegister ? "Crie sua conta" : "Bem-vindo de volta"}
            </h2>
            <p className="text-gray-400">
              {isRegister ? "Cadastre-se para começar a assistir" : "Entre para continuar assistindo"}
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm text-gray-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-11 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm text-gray-300 mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-11 pr-12 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded bg-red-900/30 border border-red-900/50 text-red-200 text-sm text-center">
                {error}
              </div>
            )}

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-white/5 text-red-600 focus:ring-2 focus:ring-red-600 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-gray-300">Lembrar-me</span>
              </label>
              <a href="#" className="text-sm text-red-500 hover:text-red-400 transition-colors">
                Esqueceu a senha?
              </a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (isRegister ? "Criando..." : "Entrando...") : (isRegister ? "Criar conta" : "Entrar")}
            </button>
          </form>

          {/* Toggle Register/Login */}
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              {isRegister ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setIsRegister(!isRegister);
                }}
                className="text-red-500 hover:text-red-400 transition-colors underline"
              >
                {isRegister ? "Entrar" : "Criar conta"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
