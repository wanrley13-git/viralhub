import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Shield, MessageCircle, Camera, Lock, Mail, Eye, EyeOff,
  Check, X, Loader2, AlertCircle, ExternalLink, Clock, Phone,
  ChevronRight,
} from 'lucide-react';
import axios from 'axios';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSidebar } from '../contexts/SidebarContext';
import { supabase, getAccessToken } from '../supabaseClient';

function cn(...inputs) { return twMerge(clsx(inputs)); }

const API_URL = import.meta.env.VITE_API_URL;

// ── Toast System ──
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={cn(
      "fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-modal animate-slide-in-toast",
      type === 'success' && "bg-primary/15 border-primary/25 text-primary",
      type === 'error' && "bg-red-500/15 border-red-500/25 text-red-400",
    )}>
      <div className={cn(
        "w-7 h-7 rounded-xl flex items-center justify-center shrink-0",
        type === 'success' && "bg-primary/20",
        type === 'error' && "bg-red-500/20",
      )}>
        {type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertCircle size={14} strokeWidth={2.5} />}
      </div>
      <span className="text-[13px] font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 p-1 rounded-lg hover:bg-white/10 transition-colors">
        <X size={12} strokeWidth={3} />
      </button>
    </div>
  );
};

// ── Profile Section ──
const ProfileSection = ({ toast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await getAccessToken();
        const res = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const emailVal = res.data.email || '';
        setEmail(emailVal);
        const storedName = localStorage.getItem('viralhub_user_name');
        if (storedName) {
          setName(storedName);
        } else {
          const raw = emailVal.split('@')[0].replace(/[._-]/g, ' ');
          setName(raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
        }
        const storedAvatar = localStorage.getItem('viralhub_user_avatar');
        if (storedAvatar) setAvatarPreview(storedAvatar);
      } catch {
        toast('Erro ao carregar perfil', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Nome não pode ser vazio';
    if (newPassword && newPassword.length < 8) errs.newPassword = 'Mínimo de 8 caracteres';
    if (newPassword && newPassword !== confirmPassword) errs.confirmPassword = 'As senhas não coincidem';
    if (newPassword && !currentPassword) errs.currentPassword = 'Digite a senha atual';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatar(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
      localStorage.setItem('viralhub_user_avatar', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      localStorage.setItem('viralhub_user_name', name);

      if (newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }

      toast('Alterações salvas com sucesso', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro ao salvar alterações';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = () => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10 stagger-children">
      {/* Avatar */}
      <div className="flex items-start gap-8">
        <div className="relative group">
          <div className="w-[100px] h-[100px] rounded-[28px] overflow-hidden border-2 border-border-subtle group-hover:border-primary/30 transition-all duration-300 shadow-card">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <span className="text-2xl font-black text-primary/70 tracking-tight">{getInitials()}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1.5 -right-1.5 w-9 h-9 bg-primary rounded-xl flex items-center justify-center border-2 border-background shadow-glow-sm opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
          >
            <Camera size={14} strokeWidth={2.5} className="text-white" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>
        <div className="pt-3">
          <h3 className="text-lg font-extrabold text-white tracking-tight">{name || 'Seu nome'}</h3>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="data-label block mb-3">Nome</label>
        <div className="relative">
          <User size={16} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })); }}
            placeholder="Seu nome"
            className={cn(
              "input-field rounded-2xl py-3.5 pl-11 pr-4",
              errors.name && "!border-red-500/40 !shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
            )}
          />
        </div>
        {errors.name && (
          <p className="flex items-center gap-1.5 mt-2 text-red-400 text-[12px] font-medium">
            <AlertCircle size={12} /> {errors.name}
          </p>
        )}
      </div>

      {/* Email (readonly) */}
      <div>
        <label className="data-label block mb-3">Email</label>
        <div className="relative">
          <Mail size={16} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
          <input
            type="email"
            value={email}
            readOnly
            className="input-field rounded-2xl py-3.5 pl-11 pr-12 opacity-50 cursor-not-allowed"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-600">
            <Lock size={13} strokeWidth={2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Fixo</span>
          </div>
        </div>
      </div>

      {/* Password */}
      <div className="space-y-4">
        <label className="data-label block">Alterar senha</label>

        <div className="relative">
          <Lock size={16} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type={showCurrentPass ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setErrors(prev => ({ ...prev, currentPassword: undefined })); }}
            placeholder="Senha atual"
            className={cn(
              "input-field rounded-2xl py-3.5 pl-11 pr-12",
              errors.currentPassword && "!border-red-500/40 !shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
            )}
          />
          <button
            type="button"
            onClick={() => setShowCurrentPass(!showCurrentPass)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
          >
            {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.currentPassword && (
          <p className="flex items-center gap-1.5 text-red-400 text-[12px] font-medium">
            <AlertCircle size={12} /> {errors.currentPassword}
          </p>
        )}

        <div className="relative">
          <Lock size={16} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type={showNewPass ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setErrors(prev => ({ ...prev, newPassword: undefined })); }}
            placeholder="Nova senha"
            className={cn(
              "input-field rounded-2xl py-3.5 pl-11 pr-12",
              errors.newPassword && "!border-red-500/40 !shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
            )}
          />
          <button
            type="button"
            onClick={() => setShowNewPass(!showNewPass)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
          >
            {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.newPassword && (
          <p className="flex items-center gap-1.5 text-red-400 text-[12px] font-medium">
            <AlertCircle size={12} /> {errors.newPassword}
          </p>
        )}

        {newPassword && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-1 rounded-full bg-surface-raised overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  newPassword.length < 8 ? "w-1/3 bg-red-500" :
                  newPassword.length < 12 ? "w-2/3 bg-amber-500" :
                  "w-full bg-primary"
                )}
              />
            </div>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              newPassword.length < 8 ? "text-red-400" :
              newPassword.length < 12 ? "text-amber-400" :
              "text-primary"
            )}>
              {newPassword.length < 8 ? 'Fraca' : newPassword.length < 12 ? 'Boa' : 'Forte'}
            </span>
          </div>
        )}

        <div className="relative">
          <Lock size={16} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type={showConfirmPass ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirmPassword: undefined })); }}
            placeholder="Confirmar nova senha"
            className={cn(
              "input-field rounded-2xl py-3.5 pl-11 pr-12",
              errors.confirmPassword && "!border-red-500/40 !shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
            )}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPass(!showConfirmPass)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
          >
            {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="flex items-center gap-1.5 text-red-400 text-[12px] font-medium">
            <AlertCircle size={12} /> {errors.confirmPassword}
          </p>
        )}
      </div>

      {/* Save */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary rounded-2xl px-8 py-3.5 text-[14px] flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Check size={16} strokeWidth={2.5} />
              <span>Salvar alterações</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ── Support Section ──
const SupportSection = () => {
  return (
    <div className="space-y-8 stagger-children">
      {/* WhatsApp CTA */}
      <div className="glass-raised rounded-3xl p-8 relative overflow-hidden group">
        {/* Ambient glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#25D366]/10 rounded-full blur-[60px] group-hover:bg-[#25D366]/20 transition-all duration-700" />

        <div className="relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-[#25D366]/15 rounded-2xl flex items-center justify-center border border-[#25D366]/20">
              <MessageCircle size={24} strokeWidth={1.5} className="text-[#25D366]" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white tracking-tight">Fale com nosso time</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Resposta rápida via WhatsApp</p>
            </div>
          </div>

          <p className="text-[14px] text-gray-400 leading-relaxed mb-6">
            Precisa de ajuda com algo? Nosso time está pronto para te ajudar com qualquer dúvida sobre a plataforma.
          </p>

          <a
            href="https://wa.me/55SEUNUMERO"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-magnetic inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl text-[14px] font-bold text-white transition-all duration-300"
            style={{ background: '#25D366', boxShadow: '0 4px 20px rgba(37, 211, 102, 0.25)' }}
          >
            <Phone size={16} strokeWidth={2.5} />
            Falar com suporte
            <ExternalLink size={13} strokeWidth={2} className="opacity-50" />
          </a>
        </div>
      </div>

      {/* Hours */}
      <div className="glass-raised rounded-3xl p-6">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-10 h-10 bg-amber-500/12 rounded-xl flex items-center justify-center border border-amber-500/15">
            <Clock size={18} strokeWidth={1.5} className="text-amber-500" />
          </div>
          <div>
            <p className="data-label">Horário de atendimento</p>
            <p className="text-[15px] font-bold text-white mt-1">Segunda a Sexta, 9h às 18h</p>
          </div>
        </div>
        <div className="flex gap-1.5 mt-4">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, i) => (
            <div
              key={day}
              className={cn(
                "flex-1 py-2 rounded-xl text-center text-[11px] font-bold uppercase tracking-wider border transition-all",
                i < 5
                  ? "bg-primary/8 border-primary/15 text-primary"
                  : "bg-surface-flat border-border-subtle text-gray-600"
              )}
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* Version */}
      <div className="text-center pt-4">
        <p className="text-[11px] text-gray-700 font-mono uppercase tracking-widest">
          ViralHub v2.0 &middot; 2026
        </p>
      </div>
    </div>
  );
};

// ── Navigation Items ──
const NAV_ITEMS = [
  { id: 'profile', label: 'Perfil', icon: User, description: 'Foto, nome e senha' },
  { id: 'support', label: 'Suporte', icon: MessageCircle, description: 'Ajuda via WhatsApp' },
];

// ── Main Settings Page ──
const Settings = () => {
  const { collapsed } = useSidebar();
  const [activeTab, setActiveTab] = useState('profile');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type) => {
    setToast({ message, type, key: Date.now() });
  }, []);

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300",
        collapsed ? "ml-[72px]" : "ml-[260px]"
      )}
    >
      {/* Background texture */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/[0.03] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-primary/[0.02] rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        {/* Left Nav Panel */}
        <div className="lg:w-[280px] shrink-0 lg:border-r border-b lg:border-b-0 border-border-subtle bg-surface/30 lg:bg-transparent">
          <div className="p-6 lg:p-8 lg:pt-12">
            <div className="mb-8 lg:mb-10">
              <p className="data-label-primary mb-2">Configurações</p>
              <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight leading-none">
                Conta
              </h1>
            </div>

            {/* Mobile: horizontal tabs / Desktop: vertical nav */}
            <nav className="flex lg:flex-col gap-1.5">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-200 group relative flex-1 lg:flex-none text-left",
                      isActive
                        ? "bg-primary/10 border border-primary/15"
                        : "border border-transparent hover:bg-white/[0.03] hover:border-border-subtle"
                    )}
                  >
                    {isActive && (
                      <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full shadow-[0_0_12px_rgba(55,178,77,0.5)]" />
                    )}
                    <div className={cn(
                      "p-2 rounded-xl transition-colors shrink-0",
                      isActive ? "bg-primary/20 text-primary" : "bg-surface-flat text-gray-500 group-hover:text-gray-300"
                    )}>
                      <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                    </div>
                    <div className="hidden lg:block min-w-0">
                      <p className={cn(
                        "text-[13px] font-bold transition-colors",
                        isActive ? "text-white" : "text-gray-400 group-hover:text-white"
                      )}>
                        {item.label}
                      </p>
                      <p className="text-[11px] text-gray-600 mt-0.5 truncate">{item.description}</p>
                    </div>
                    <span className="lg:hidden text-[13px] font-bold text-gray-300">{item.label}</span>
                    {isActive && (
                      <ChevronRight size={14} className="hidden lg:block ml-auto text-primary/50" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="max-w-[560px] mx-auto px-6 lg:px-12 py-8 lg:py-12">
            {/* Section Header */}
            {activeTab === 'profile' && (
              <div className="mb-10">
                <div className="flex items-center gap-2.5 mb-1">
                  <User size={18} strokeWidth={2} className="text-primary" />
                  <h2 className="text-xl font-black text-white tracking-tight">Perfil</h2>
                </div>
                <p className="text-[13px] text-gray-500 mt-1">
                  Gerencie suas informações pessoais e segurança
                </p>
                <div className="h-px bg-gradient-to-r from-primary/20 via-border-subtle to-transparent mt-6" />
              </div>
            )}
            {/* Content */}
            <div key={activeTab} className="animate-fade-in">
              {activeTab === 'profile' && <ProfileSection toast={showToast} />}
              {activeTab === 'support' && <SupportSection />}
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Settings;
