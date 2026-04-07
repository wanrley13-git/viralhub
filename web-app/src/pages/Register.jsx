import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TrendingUp, Mail, Lock, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Erro ao criar conta. Tente outro email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-[420px] animate-fade-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-10 stagger-children">
          <div className="inline-flex items-center justify-center p-4 bg-primary/12 rounded-3xl mb-5 border border-primary/15 glow-primary">
            <TrendingUp size={24} strokeWidth={1.5} className="text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Criar Conta</h1>
          <p className="text-gray-500 text-sm mt-2 font-serif italic">Junte-se à elite da criação viral</p>
        </div>

        {/* Form Card */}
        <div className="glass-raised rounded-4xl p-9 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          {success ? (
            <div className="text-center py-10 space-y-5 animate-scale-in">
              <div className="inline-flex items-center justify-center p-5 bg-green-500/10 rounded-3xl border border-green-500/20">
                <CheckCircle2 size={48} strokeWidth={1.5} className="text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight">Conta Criada!</h2>
                <p className="text-gray-500 text-sm mt-2">Redirecionando para o login...</p>
              </div>
              <div className="flex justify-center">
                <div className="w-32 h-1 bg-surface-flat rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full animate-[slideRight_2s_ease-in-out_forwards]" style={{ animation: 'slideRight 2s ease-in-out forwards' }} />
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 ml-1 tracking-[0.1em] uppercase">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={16} strokeWidth={1.5} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field rounded-2xl p-4 pl-12"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 ml-1 tracking-[0.1em] uppercase">Senha</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={16} strokeWidth={1.5} />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field rounded-2xl p-4 pl-12"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-500/8 border border-red-500/15 text-red-400 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-fade-in">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 btn-primary rounded-2xl flex justify-center items-center gap-2.5 text-sm disabled:opacity-50 disabled:pointer-events-none mt-2"
              >
                {loading ? <UserPlus className="animate-spin" size={18} strokeWidth={2.5} /> : <UserPlus size={18} strokeWidth={2.5} />}
                Começar Agora
              </button>
            </form>
          )}

          <div className="mt-8 text-center text-sm text-gray-500">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-white hover:text-accent font-semibold transition-colors">
              Fazer login
            </Link>
          </div>
        </div>

        {/* Bottom decorative */}
        <div className="flex justify-center mt-8">
          <div className="flex items-center gap-2.5 text-gray-600">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-mono text-[10px] tracking-widest uppercase">Sistema Operacional</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
