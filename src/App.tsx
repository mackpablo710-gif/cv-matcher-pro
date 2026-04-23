import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  FileText, Upload, ArrowRight, CheckCircle2, AlertCircle, Download,
  ChevronRight, ChevronLeft, Plus, Trash2, LogOut,
  User as UserIcon, Globe, Mail, Lock, Chrome, Target, Zap, Shield,
  ArrowUp, ArrowDown, Search, Star, BarChart2, Clock, RefreshCw, X, Layers,
  CreditCard, Settings, Users, ShoppingBag, TrendingUp, Edit2, Save, Check, Pencil,
  DollarSign, Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, signInWithEmail, signUpWithEmail, signOut, signInWithGoogle } from './lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { extractPdfText, getInitialMatch, adaptCV, getInterviewQuestions } from './services/apiClient';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } from 'docx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── Utils ────────────────────────────────────────────────────────────────────

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

function cleanText(value: any): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1').replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getJobTitle(jdText: string) {
  if (!jdText) return 'Cargo';
  const lines = jdText.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return 'Cargo';
  return lines[0].length > 60 ? lines[0].slice(0, 60) + '…' : lines[0];
}

function normalizeCV(data: any) {
  return {
    personal_info: {
      name: cleanText(data?.personal_info?.name || ''),
      location: cleanText(data?.personal_info?.location || ''),
      email: cleanText(data?.personal_info?.email || ''),
      phone: cleanText(data?.personal_info?.phone || ''),
      summary: cleanText(data?.personal_info?.summary || ''),
    },
    experience: Array.isArray(data?.experience) ? data.experience.map((e: any) => ({
      company: cleanText(e?.company || ''),
      position: cleanText(e?.position || ''),
      period: cleanText(e?.period || ''),
      description: Array.isArray(e?.description) ? e.description.map((d: any) => cleanText(d)).filter(Boolean) : [],
    })) : [],
    education: Array.isArray(data?.education) ? data.education.map((e: any) => ({
      institution: cleanText(e?.institution || ''),
      degree: cleanText(e?.degree || ''),
      period: cleanText(e?.period || ''),
      description: Array.isArray(e?.description) ? e.description.map((d: any) => cleanText(d)).filter(Boolean) : [],
    })) : [],
    skills: {
      technical: Array.isArray(data?.skills?.technical) ? data.skills.technical.map((x: any) => cleanText(x)).filter(Boolean) : [],
      soft: Array.isArray(data?.skills?.soft) ? data.skills.soft.map((x: any) => cleanText(x)).filter(Boolean) : [],
    },
    others: {
      languages: cleanText(data?.others?.languages || ''),
      tools: cleanText(data?.others?.tools || ''),
      additional: cleanText(data?.others?.additional || ''),
    },
  };
}

function formatCLP(n: number) { return `$${n.toLocaleString('es-CL')}`; }

// ─── UI Components ────────────────────────────────────────────────────────────

const Button = ({ children, onClick, variant = 'primary', className, disabled, loading, type = 'button', size = 'md' }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'black' | 'white';
  className?: string; disabled?: boolean; loading?: boolean;
  type?: 'button' | 'submit' | 'reset'; size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200/50',
    black: 'bg-zinc-900 text-white hover:bg-black shadow-lg shadow-zinc-200/50',
    white: 'bg-white text-zinc-900 hover:bg-zinc-50 shadow-lg shadow-zinc-200/50 border border-zinc-100',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    outline: 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50',
    ghost: 'text-zinc-600 hover:bg-zinc-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
  };
  const sizes = { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3', lg: 'px-8 py-4 text-lg' };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={cn('rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]', variants[variant], sizes[size], className)}>
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
};

const Card = ({ children, className, noPadding }: { children: React.ReactNode; className?: string; noPadding?: boolean }) => (
  <div className={cn('bg-white border border-zinc-100 rounded-3xl shadow-sm overflow-hidden', noPadding ? '' : 'p-8', className)}>
    {children}
  </div>
);

const Input = ({ label, type = 'text', value, onChange, placeholder, icon: Icon, required }: any) => (
  <div className="space-y-2">
    {label && <label className="text-xs font-black uppercase tracking-widest text-zinc-400">{label}</label>}
    <div className="relative group">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" />}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
        className={cn('w-full bg-zinc-50 border border-zinc-100 rounded-2xl py-3.5 px-4 outline-none transition-all focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-medium text-sm', Icon ? 'pl-11' : '')} />
    </div>
  </div>
);

const Badge = ({ children, color = 'zinc' }: { children: React.ReactNode; color?: 'zinc' | 'indigo' | 'green' | 'orange' | 'red' }) => {
  const colors = {
    zinc: 'bg-zinc-100 text-zinc-600', indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-emerald-50 text-emerald-700', orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-600',
  };
  return <span className={cn('text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full', colors[color])}>{children}</span>;
};

// Inline editable field — auto-expands, looks like a document
const DocField = ({ value, onChange, className = '', multiline = false, placeholder = '—' }: {
  value: string; onChange: (v: string) => void;
  className?: string; multiline?: boolean; placeholder?: string;
}) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = taRef.current.scrollHeight + 'px';
    }
  }, [value]);

  if (multiline) {
    return (
      <textarea ref={taRef} value={value} onChange={e => { onChange(e.target.value); if (taRef.current) { taRef.current.style.height = 'auto'; taRef.current.style.height = taRef.current.scrollHeight + 'px'; } }}
        placeholder={placeholder} rows={1}
        className={cn('w-full bg-transparent resize-none overflow-hidden outline-none cursor-text rounded px-1 py-0.5 hover:bg-indigo-50/40 focus:bg-indigo-50/60 transition-colors placeholder:text-zinc-300 leading-relaxed', className)} />
    );
  }
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={cn('bg-transparent outline-none cursor-text w-full rounded px-1 py-0.5 hover:bg-indigo-50/40 focus:bg-indigo-50/60 transition-colors placeholder:text-zinc-300', className)} />
  );
};

// Animated progress bar with label
const ProgressBar = ({ progress, label, sublabel }: { progress: number; label?: string; sublabel?: string }) => (
  <div className="space-y-2">
    {(label || sublabel) && (
      <div className="flex items-center justify-between">
        {label && <p className="text-sm font-semibold text-zinc-700">{label}</p>}
        {sublabel && <p className="text-xs text-zinc-400">{sublabel}</p>}
        <span className="text-sm font-black text-indigo-600 ml-auto">{progress}%</span>
      </div>
    )}
    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
      <motion.div className="h-full bg-indigo-600 rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
    </div>
  </div>
);

const ScoreRing = ({ score, size = 120 }: { score: number; size?: number }) => {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f4f4f5" strokeWidth="8" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - pct }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-black" style={{ color }}>{score}%</div>
      </div>
    </div>
  );
};

const Stepper = ({ currentStep, steps }: { currentStep: number; steps: string[] }) => (
  <div className="flex items-center justify-between w-full max-w-3xl mx-auto mb-8 sm:mb-16 px-0 sm:px-4">
    {steps.map((step, i) => (
      <React.Fragment key={step}>
        <div className="flex flex-col items-center gap-1 sm:gap-3">
          <motion.div initial={false}
            animate={{ backgroundColor: i <= currentStep ? '#4f46e5' : '#fff', color: i <= currentStep ? '#fff' : '#a1a1aa', scale: i === currentStep ? 1.1 : 1, borderColor: i <= currentStep ? '#4f46e5' : '#f4f4f5' }}
            className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-xs sm:text-sm font-black border-2 shadow-sm">
            {i < currentStep ? <CheckCircle2 className="w-4 h-4 sm:w-6 sm:h-6" /> : i + 1}
          </motion.div>
          <span className={cn('text-[9px] sm:text-[10px] font-black uppercase tracking-widest whitespace-nowrap hidden sm:block', i <= currentStep ? 'text-indigo-600' : 'text-zinc-400')}>{step}</span>
        </div>
        {i < steps.length - 1 && (
          <div className="flex-1 h-0.5 mx-1 sm:mx-4 bg-zinc-100 relative overflow-hidden rounded-full">
            <motion.div initial={{ width: 0 }} animate={{ width: i < currentStep ? '100%' : '0%' }}
              className="absolute inset-0 bg-indigo-600" transition={{ duration: 0.8 }} />
          </div>
        )}
      </React.Fragment>
    ))}
  </div>
);

// ─── PDF Templates ────────────────────────────────────────────────────────────

function generateClassicPDF(cv: any, language: string) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const isEn = language.toLowerCase().includes('ing');
  const labels = isEn
    ? { summary: 'Summary', experience: 'Professional Experience', education: 'Education', skills: 'Skills', technical: 'Technical', soft: 'Soft Skills', languages: 'Languages', tools: 'Tools', additional: 'Additional' }
    : { summary: 'Resumen', experience: 'Experiencia Profesional', education: 'Educación', skills: 'Habilidades', technical: 'Técnicas', soft: 'Blandas', languages: 'Idiomas', tools: 'Herramientas', additional: 'Adicional' };
  const W = 210; const H = 297; const ml = 18; const mr = W - 18; const cw = mr - ml;
  const LINE_H = 4.8; const BOTTOM_MARGIN = 18; let y = 0; let page = 1;

  const checkPageBreak = (needed: number) => {
    if (y + needed > H - BOTTOM_MARGIN) { doc.addPage(); page++; y = 16; }
  };

  doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 44, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(cv.personal_info.name || 'Nombre', ml, 18);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const contactItems = [cv.personal_info.email, cv.personal_info.phone, cv.personal_info.location].filter(Boolean);
  doc.text(contactItems.join('  ·  '), ml, 27);
  y = 54;

  const section = (title: string) => {
    checkPageBreak(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(79, 70, 229);
    doc.text(title.toUpperCase(), ml, y); y += 1.5;
    doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.4); doc.line(ml, y, mr, y); y += 5;
    doc.setTextColor(30, 30, 30);
  };

  const addText = (text: string, indent = 0, bold = false, size = 9.5) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, cw - indent);
    const blockH = lines.length * LINE_H + 1;
    checkPageBreak(blockH);
    doc.text(lines, ml + indent, y); y += blockH;
  };

  if (cv.personal_info.summary) { section(labels.summary); addText(cv.personal_info.summary); y += 4; }

  if (cv.experience?.length) {
    section(labels.experience);
    cv.experience.forEach((exp: any) => {
      // Estimate block height before drawing
      const descLines = (exp.description || []).reduce((acc: number, d: string) => {
        return acc + doc.splitTextToSize(`• ${d}`, cw - 4).length;
      }, 0);
      const blockH = 10 + descLines * LINE_H + 3;
      checkPageBreak(blockH);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text(exp.position || '', ml, y);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`${exp.company || ''}  |  ${exp.period || ''}`, ml, y + LINE_H); y += 10;
      doc.setTextColor(30, 30, 30);
      (exp.description || []).forEach((d: string) => { addText(`• ${d}`, 4); });
      y += 3;
    });
  }

  if (cv.education?.length) {
    section(labels.education);
    cv.education.forEach((edu: any) => {
      checkPageBreak(14);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text(edu.degree || '', ml, y);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`${edu.institution || ''}  |  ${edu.period || ''}`, ml, y + LINE_H);
      doc.setTextColor(30, 30, 30); y += 12;
      if (edu.description?.length) edu.description.forEach((d: string) => addText(`• ${d}`, 4));
    });
    y += 2;
  }

  const hasTech = cv.skills?.technical?.length > 0;
  const hasSoft = cv.skills?.soft?.length > 0;
  if (hasTech || hasSoft) {
    section(labels.skills);
    if (hasTech) addText(`${labels.technical}: ${cv.skills.technical.join(', ')}`);
    if (hasSoft) addText(`${labels.soft}: ${cv.skills.soft.join(', ')}`);
    y += 2;
  }

  const o = cv.others;
  if (o?.languages || o?.tools || o?.additional) {
    section(labels.additional);
    if (o.languages) addText(`${labels.languages}: ${o.languages}`);
    if (o.tools) addText(`${labels.tools}: ${o.tools}`);
    if (o.additional) addText(o.additional);
  }
  doc.save(`CV_Clasico_${(cv.personal_info.name || 'cv').replace(/\s+/g, '_')}.pdf`);
}

function generateModernPDF(cv: any, language: string) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const isEn = language.toLowerCase().includes('ing');
  const labels = isEn
    ? { summary: 'About', experience: 'Experience', education: 'Education', additional: 'Additional' }
    : { summary: 'Perfil', experience: 'Experiencia', education: 'Educación', additional: 'Adicional' };
  const W = 210; const H = 297; const sideW = 68; const mainX = sideW + 10; const mainW = W - mainX - 12;
  const LINE_H = 4.5; const BOTTOM_MARGIN = 18;
  let ys = 0; let ym = 0;

  const drawSidebarBg = () => { doc.setFillColor(24, 24, 27); doc.rect(0, 0, sideW, H, 'F'); };
  drawSidebarBg();
  doc.setFillColor(79, 70, 229); doc.circle(sideW / 2, 28, 14, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  const initial = (cv.personal_info.name || 'U')[0].toUpperCase();
  doc.text(initial, sideW / 2 - 3.5, 32); ys = 52;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  const nameLines = doc.splitTextToSize(cv.personal_info.name || '', sideW - 10);
  doc.text(nameLines, 5, ys); ys += nameLines.length * 5 + 8;

  const sideSection = (title: string) => {
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(140, 140, 160);
    doc.text(title.toUpperCase(), 5, ys); ys += 4;
    doc.setTextColor(210, 210, 220); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  };
  const sideText = (text: string) => {
    const lines = doc.splitTextToSize(text, sideW - 10);
    doc.text(lines, 5, ys); ys += lines.length * 4 + 1.5;
  };

  const contactArr = [cv.personal_info.email, cv.personal_info.phone, cv.personal_info.location].filter(Boolean);
  if (contactArr.length) { sideSection('Contacto'); contactArr.forEach(sideText); ys += 4; }
  if (cv.skills?.technical?.length) { sideSection('Habilidades Técnicas'); cv.skills.technical.forEach((s: string) => sideText(`• ${s}`)); ys += 4; }
  if (cv.skills?.soft?.length) { sideSection('Soft Skills'); cv.skills.soft.forEach((s: string) => sideText(`• ${s}`)); ys += 4; }
  if (cv.others?.languages) { sideSection('Idiomas'); sideText(cv.others.languages); ys += 2; }
  if (cv.others?.tools) { sideSection('Herramientas'); sideText(cv.others.tools); }

  ym = 16;
  let currentPage = 1;

  const checkMainBreak = (needed: number) => {
    if (ym + needed > H - BOTTOM_MARGIN) {
      doc.addPage(); currentPage++;
      // Redraw sidebar on new page
      drawSidebarBg();
      ym = 16;
    }
  };

  const mainSection = (title: string) => {
    checkMainBreak(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(79, 70, 229);
    doc.text(title.toUpperCase(), mainX, ym); ym += 2;
    doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.3); doc.line(mainX, ym, W - 12, ym); ym += 5;
    doc.setTextColor(30, 30, 30);
  };

  const mainText = (text: string, indent = 0, bold = false, size = 9) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, mainW - indent);
    const blockH = lines.length * LINE_H + 1;
    checkMainBreak(blockH);
    doc.text(lines, mainX + indent, ym); ym += blockH;
  };

  if (cv.personal_info.summary) { mainSection(labels.summary); mainText(cv.personal_info.summary); ym += 4; }

  if (cv.experience?.length) {
    mainSection(labels.experience);
    cv.experience.forEach((exp: any) => {
      const descH = (exp.description || []).reduce((acc: number, d: string) =>
        acc + doc.splitTextToSize(`• ${d}`, mainW - 4).length * LINE_H + 1, 0);
      checkMainBreak(11 + descH + 3);
      mainText(exp.position || '', 0, true, 10);
      doc.setTextColor(100, 100, 100); mainText(`${exp.company || ''}  |  ${exp.period || ''}`, 0, false, 8.5);
      doc.setTextColor(30, 30, 30);
      (exp.description || []).forEach((d: string) => mainText(`• ${d}`, 4));
      ym += 3;
    });
  }

  if (cv.education?.length) {
    mainSection(labels.education);
    cv.education.forEach((edu: any) => {
      checkMainBreak(13);
      mainText(edu.degree || '', 0, true, 10);
      doc.setTextColor(100, 100, 100); mainText(`${edu.institution || ''}  |  ${edu.period || ''}`, 0, false, 8.5);
      doc.setTextColor(30, 30, 30);
      if (edu.description?.length) edu.description.forEach((d: string) => mainText(`• ${d}`, 4));
      ym += 2;
    });
  }
  if (cv.others?.additional) { mainSection(labels.additional); mainText(cv.others.additional); }
  doc.save(`CV_Moderno_${(cv.personal_info.name || 'cv').replace(/\s+/g, '_')}.pdf`);
}

// ─── Word Export ──────────────────────────────────────────────────────────────

async function generateWordDoc(cv: any, language: string) {
  const isEn = language.toLowerCase().includes('ing');
  const labels = isEn
    ? { summary: 'Summary', experience: 'Professional Experience', education: 'Education', skills: 'Skills', technical: 'Technical Skills', soft: 'Soft Skills', languages: 'Languages', tools: 'Tools', additional: 'Additional Information' }
    : { summary: 'Resumen Profesional', experience: 'Experiencia Profesional', education: 'Educación', skills: 'Habilidades', technical: 'Habilidades Técnicas', soft: 'Soft Skills', languages: 'Idiomas', tools: 'Herramientas', additional: 'Información Adicional' };

  const mkHeading = (text: string) => new Paragraph({
    text, heading: HeadingLevel.HEADING_2,
    border: { bottom: { color: '4f46e5', style: BorderStyle.SINGLE, size: 4 } },
    spacing: { before: 280, after: 120 },
  });

  const mkBold = (text: string) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22 })],
    spacing: { after: 40 },
  });

  const mkSub = (text: string) => new Paragraph({
    children: [new TextRun({ text, color: '666666', size: 18, italics: true })],
    spacing: { after: 80 },
  });

  const mkText = (text: string) => new Paragraph({
    children: [new TextRun({ text, size: 20 })],
    spacing: { after: 60 },
  });

  const mkBullet = (text: string) => new Paragraph({
    children: [new TextRun({ text, size: 20 })],
    bullet: { level: 0 },
    spacing: { after: 40 },
  });

  const sections: Paragraph[] = [];

  // Header
  sections.push(new Paragraph({
    children: [new TextRun({ text: cv.personal_info?.name || '', bold: true, size: 36, color: '4f46e5' })],
    alignment: AlignmentType.LEFT, spacing: { after: 120 },
  }));
  const contactParts = [cv.personal_info?.email, cv.personal_info?.phone, cv.personal_info?.location].filter(Boolean);
  if (contactParts.length) sections.push(new Paragraph({
    children: [new TextRun({ text: contactParts.join('  ·  '), size: 18, color: '666666' })],
    spacing: { after: 200 },
  }));

  // Summary
  if (cv.personal_info?.summary) {
    sections.push(mkHeading(labels.summary));
    sections.push(mkText(cv.personal_info.summary));
  }

  // Experience
  if (cv.experience?.length) {
    sections.push(mkHeading(labels.experience));
    cv.experience.forEach((exp: any) => {
      sections.push(mkBold(exp.position || ''));
      sections.push(mkSub(`${exp.company || ''} | ${exp.period || ''}`));
      (exp.description || []).forEach((d: string) => sections.push(mkBullet(d)));
      sections.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    });
  }

  // Education
  if (cv.education?.length) {
    sections.push(mkHeading(labels.education));
    cv.education.forEach((edu: any) => {
      sections.push(mkBold(edu.degree || ''));
      sections.push(mkSub(`${edu.institution || ''} | ${edu.period || ''}`));
      (edu.description || []).forEach((d: string) => sections.push(mkBullet(d)));
      sections.push(new Paragraph({ text: '', spacing: { after: 80 } }));
    });
  }

  // Skills
  if (cv.skills?.technical?.length || cv.skills?.soft?.length) {
    sections.push(mkHeading(labels.skills));
    if (cv.skills?.technical?.length) {
      sections.push(mkBold(labels.technical));
      sections.push(mkText(cv.skills.technical.join(', ')));
    }
    if (cv.skills?.soft?.length) {
      sections.push(mkBold(labels.soft));
      sections.push(mkText(cv.skills.soft.join(', ')));
    }
  }

  // Others
  const o = cv.others;
  if (o?.languages || o?.tools || o?.additional) {
    sections.push(mkHeading(labels.additional));
    if (o.languages) sections.push(mkText(`${labels.languages}: ${o.languages}`));
    if (o.tools) sections.push(mkText(`${labels.tools}: ${o.tools}`));
    if (o.additional) sections.push(mkText(o.additional));
  }

  const doc = new Document({
    styles: {
      paragraphStyles: [{
        id: 'Heading2', name: 'Heading 2',
        run: { color: '4f46e5', bold: true, size: 22 },
      }],
    },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children: sections }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `CV_${(cv.personal_info?.name || 'cv').replace(/\s+/g, '_')}.docx`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

const AuthScreen = ({ onAuth }: { onAuth: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (isLogin) {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;
        onAuth();
      } else {
        const { data, error } = await signUpWithEmail(email, password, name);
        if (error) throw error;
        if (data.user && !data.session) {
          setShowConfirm(true);
        } else {
          onAuth();
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    await signInWithGoogle();
  };

  if (showConfirm) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 mb-2">Confirma tu cuenta</h2>
          <p className="text-zinc-500 mb-2">Te enviamos un enlace de confirmación a:</p>
          <p className="font-black text-indigo-600 mb-6">{email}</p>
          <p className="text-sm text-zinc-400 mb-8">Revisa tu bandeja de entrada (y la carpeta spam). Al hacer click en el enlace serás redirigido aquí para iniciar sesión.</p>
          <Button variant="outline" className="w-full" onClick={() => { setShowConfirm(false); setIsLogin(true); }}>
            Ya confirmé — Iniciar sesión
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-zinc-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/80 to-zinc-900" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="text-white font-black text-xl tracking-tight">CV Matcher Pro</span>
        </div>
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-5xl font-black text-white leading-none mb-4">Tu próximo<br />trabajo empieza<br /><span className="text-indigo-400 italic font-serif">aquí.</span></h1>
            <p className="text-zinc-400 text-lg font-medium leading-relaxed">IA avanzada que adapta tu CV a cualquier oferta en segundos. Múltiples CVs, análisis de match y exportación profesional.</p>
          </div>
          <div className="space-y-4">
            {[{ icon: Target, text: 'Match Score de alta precisión' }, { icon: Shield, text: 'Optimización ATS garantizada' }, { icon: Layers, text: 'Múltiples CVs maestros' }].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600/20 rounded-xl flex items-center justify-center"><Icon className="w-4 h-4 text-indigo-400" /></div>
                <span className="text-zinc-300 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-zinc-500 text-sm font-medium">© 2026 CV Matcher Pro</div>
      </div>
      <div className="flex items-center justify-center p-8 bg-zinc-50/50">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-black text-zinc-900 mb-2">{isLogin ? 'Bienvenido' : 'Crear cuenta'}</h2>
            <p className="text-zinc-500 font-medium">{isLogin ? 'Ingresa para continuar' : 'Únete en segundos'}</p>
          </div>
          <Card className="shadow-xl shadow-zinc-200/40 border-none">
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && <Input label="Nombre" placeholder="Tu nombre" icon={UserIcon} value={name} onChange={(e: any) => setName(e.target.value)} required />}
              <Input label="Email" type="email" placeholder="tu@email.com" icon={Mail} value={email} onChange={(e: any) => setEmail(e.target.value)} required />
              <Input label="Contraseña" type="password" placeholder="••••••••" icon={Lock} value={password} onChange={(e: any) => setPassword(e.target.value)} required />
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
                </motion.div>
              )}
              <Button type="submit" className="w-full py-3.5" loading={loading}>{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</Button>
            </form>
            <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-100" /></div><div className="relative flex justify-center text-xs"><span className="bg-white px-4 text-zinc-400 font-bold uppercase tracking-widest">O</span></div></div>
            <Button variant="white" className="w-full py-3.5" onClick={handleGoogle} disabled={loading}>
              <Chrome className="w-4 h-4 text-indigo-600" /> Continuar con Google
            </Button>
            <p className="text-center mt-6 text-zinc-500 text-sm font-medium">
              {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
              <button onClick={() => { setIsLogin(!isLogin); setError(null); }} className="ml-1.5 font-black text-indigo-600 hover:underline">
                {isLogin ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

// ─── Master CVs Manager ───────────────────────────────────────────────────────

const MasterCVManager = ({ userId, onSelect, onClose }: { userId: string; onSelect: (cv: any) => void; onClose: () => void }) => {
  const [cvs, setCVs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMsg, setUploadMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchCVs(); }, []);

  const fetchCVs = async () => {
    setLoading(true);
    const { data } = await supabase.from('master_cvs').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    setCVs(data || []);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null); setUploadProgress(5); setUploadMsg('Leyendo PDF...');
    let timer: any = null;
    try {
      const base64 = await fileToBase64(file);
      setUploadProgress(15); setUploadMsg('Extrayendo texto con IA...');
      // Simulate progress during Gemini API call
      let fake = 15;
      timer = setInterval(() => { fake = Math.min(fake + 4, 82); setUploadProgress(fake); }, 400);
      const res = await fetch('/api/extract-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: base64 }),
      });
      clearInterval(timer); timer = null;
      const { text, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      const content = (text || '').trim();
      if (!content) throw new Error('No se pudo extraer texto del PDF. Asegúrate de que el PDF no esté protegido.');
      setUploadProgress(90); setUploadMsg('Guardando CV...');
      const { error: dbError } = await supabase.from('master_cvs').insert({
        user_id: userId, name: file.name.replace(/\.pdf$/i, ''), content, file_name: file.name,
      });
      if (dbError) throw dbError;
      setUploadProgress(100); setUploadMsg('¡CV guardado!');
      await fetchCVs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (timer) clearInterval(timer);
      setUploading(false); setUploadProgress(0); setUploadMsg('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteCV = async (id: string) => {
    await supabase.from('master_cvs').delete().eq('id', id);
    await fetchCVs();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div><h2 className="text-xl font-black text-zinc-900">Mis CVs Maestros</h2><p className="text-sm text-zinc-500 mt-0.5">Selecciona o sube un CV base</p></div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100 transition-colors"><X className="w-5 h-5 text-zinc-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? <div className="text-center py-8 text-zinc-400">Cargando...</div> : cvs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">No tienes CVs guardados aún</p>
            </div>
          ) : cvs.map(cv => (
            <div key={cv.id} className="flex items-center gap-3 p-4 border border-zinc-100 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-indigo-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-900 truncate">{cv.name}</p>
                <p className="text-xs text-zinc-400">{new Date(cv.created_at).toLocaleDateString('es-CL')}</p>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => deleteCV(cv.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                <Button size="sm" onClick={() => onSelect(cv)}>Usar este</Button>
              </div>
            </div>
          ))}
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
        </div>
        <div className="p-6 border-t border-zinc-100 space-y-3">
          {uploading && uploadProgress > 0 && (
            <ProgressBar progress={uploadProgress} label={uploadMsg} />
          )}
          <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="w-4 h-4" /> {uploading ? uploadMsg || 'Procesando...' : 'Subir nuevo CV (PDF)'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Credits Banner ───────────────────────────────────────────────────────────

const CreditsBanner = ({ credits, onBuy }: { credits: number; onBuy: () => void }) => {
  if (credits > 5) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className={cn('mx-6 mt-4 p-4 rounded-2xl flex items-center justify-between gap-4',
        credits === 0 ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100')}>
      <div className="flex items-center gap-3">
        <CreditCard className={cn('w-5 h-5', credits === 0 ? 'text-red-500' : 'text-amber-600')} />
        <p className={cn('text-sm font-semibold', credits === 0 ? 'text-red-700' : 'text-amber-800')}>
          {credits === 0 ? 'Sin adaptaciones disponibles. Compra un paquete para continuar.' : `Te quedan ${credits} adaptación${credits !== 1 ? 'es' : ''}. ¡Recarga pronto!`}
        </p>
      </div>
      <Button size="sm" onClick={onBuy} variant={credits === 0 ? 'primary' : 'outline'}>
        <ShoppingBag className="w-3.5 h-3.5" /> Comprar
      </Button>
    </motion.div>
  );
};

// ─── Packages Modal ───────────────────────────────────────────────────────────

const PackagesModal = ({ onClose, userId, currentCredits, onPurchased }: {
  onClose: () => void; userId?: string; currentCredits?: number; onPurchased?: (newCredits: number) => void;
}) => {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('packages').select('*').eq('active', true).order('sort_order').then(({ data }) => {
      setPackages(data || []);
      setLoading(false);
    });
  }, []);

  const handleBuy = async (pkg: any) => {
    if (!userId || processing) return;
    setProcessing(pkg.id);
    setError('');
    try {
      const res = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.init_point) throw new Error(data.error || 'Error al crear preferencia');
      // Redirect to Mercado Pago — user never enters card data on our site
      window.location.href = data.init_point;
    } catch (e: any) {
      setError(e.message || 'Error al iniciar pago');
      setProcessing(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-zinc-900">Paquetes de adaptaciones</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Elige el plan que mejor se adapte a ti</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100"><X className="w-5 h-5 text-zinc-500" /></button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6 space-y-4">
            {loading ? (
              <div className="text-center py-8 text-zinc-400">Cargando...</div>
            ) : packages.map((pkg, i) => (
              <div key={pkg.id} className={cn('p-5 rounded-2xl border-2 transition-all', i === 1 ? 'border-indigo-600 bg-indigo-50/50' : 'border-zinc-100')}>
                {i === 1 && <div className="mb-2"><Badge color="indigo">Más popular</Badge></div>}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-black text-zinc-900 text-lg">{pkg.name}</p>
                    <p className="text-sm text-zinc-500">{pkg.credits} adaptaciones completas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-zinc-900">{formatCLP(pkg.price)}</p>
                    <p className="text-xs text-zinc-400">{formatCLP(Math.round(pkg.price / pkg.credits))} / adaptación</p>
                  </div>
                </div>
                <Button className="w-full justify-center" onClick={() => handleBuy(pkg)} loading={processing === pkg.id} disabled={!!processing}>
                  {processing === pkg.id ? 'Redirigiendo...' : <><CreditCard className="w-4 h-4" /> Pagar con Mercado Pago</>}
                </Button>
              </div>
            ))}
            {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-zinc-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Pago 100% seguro · Procesado por Mercado Pago · Tus datos nunca pasan por nuestro servidor</span>
            </div>
          </motion.div>

          {false && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-zinc-900">¡Pago confirmado!</h3>
                <p className="text-zinc-500 mt-1">Se agregaron <strong className="text-indigo-600">{selected?.credits} adaptaciones</strong> a tu cuenta</p>
              </div>
              <Button className="w-full" onClick={onClose}><Check className="w-4 h-4" /> Continuar</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ─── History Dashboard ────────────────────────────────────────────────────────

const Dashboard = ({ userId, credits, onLoadAdaptation, onNew, onBuy }: {
  userId: string; credits: number;
  onLoadAdaptation: (item: any) => void; onNew: () => void; onBuy: () => void;
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchHistory(); }, []);
  useEffect(() => {
    if (!search) { setFiltered(items); return; }
    setFiltered(items.filter(i => i.job_title?.toLowerCase().includes(search.toLowerCase())));
  }, [search, items]);

  const fetchHistory = async () => {
    setLoading(true);
    const { data } = await supabase.from('adaptations').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    setItems(data || []); setFiltered(data || []);
    setLoading(false);
  };

  const avgScore = items.length ? Math.round(items.reduce((a, i) => a + (i.initial_score || 0), 0) / items.length) : 0;
  const bestScore = items.length ? Math.max(...items.map(i => i.final_score || 0)) : 0;
  const initialMatches = items.length; // every record = 1 initial match
  const fullAdaptations = items.filter(i => i.final_score > 0).length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Stats grid: 2 cols on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[
            { label: 'Matches iniciales', value: initialMatches, icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'CVs optimizados', value: fullAdaptations, icon: Zap, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Score promedio', value: initialMatches > 0 ? `${avgScore}%` : '—', icon: BarChart2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Mejor match', value: bestScore > 0 ? `${bestScore}%` : '—', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((stat, i) => (
            <Card key={i} className="p-4 sm:p-5">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0', stat.bg)}>
                  <stat.icon className={cn('w-4 h-4 sm:w-5 sm:h-5', stat.color)} />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-black text-zinc-900">{stat.value}</p>
                  <p className="text-[11px] sm:text-xs text-zinc-500 font-medium leading-tight">{stat.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
            <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-sm font-black text-indigo-700">{credits} adaptaciones disponibles</span>
            <button onClick={onBuy} className="ml-2 text-xs font-bold text-indigo-500 hover:text-indigo-700 underline whitespace-nowrap">Comprar más</button>
          </div>
        </div>

        <Card noPadding>
          <div className="p-4 sm:p-6 border-b border-zinc-100">
            <div className="flex items-center justify-between gap-3 mb-3 sm:mb-0">
              <h2 className="text-lg font-black text-zinc-900">Historial de adaptaciones</h2>
              <Button size="sm" onClick={onNew} disabled={credits <= 0}>
                <Plus className="w-4 h-4" /> Nueva
              </Button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cargo..."
                className="pl-9 pr-4 py-2 text-sm border border-zinc-100 rounded-xl bg-zinc-50 outline-none focus:border-indigo-400 w-full" />
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-zinc-400">Cargando historial...</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <Clock className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium">{search ? 'Sin resultados' : 'Aún no tienes adaptaciones'}</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filtered.map(item => {
                const isPending = !item.final_score || item.final_score === 0;
                const scoreColor = item.final_score >= 80 ? 'text-emerald-600' : item.final_score >= 60 ? 'text-amber-600' : 'text-red-500';
                return (
                  <div key={item.id} onClick={() => onLoadAdaptation(item)} className="flex items-center gap-3 px-4 sm:px-6 py-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                    <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0', isPending ? 'bg-amber-50' : 'bg-indigo-50')}>
                      <FileText className={cn('w-4 h-4 sm:w-5 sm:h-5', isPending ? 'text-amber-500' : 'text-indigo-500')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-zinc-900 truncate">{item.job_title || 'Cargo sin nombre'}</p>
                        {isPending && <span className="shrink-0 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendiente</span>}
                      </div>
                      <p className="text-xs text-zinc-400">{new Date(item.created_at).toLocaleDateString('es-CL')} · {item.language || 'Español'}</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                      <div className="text-center">
                        <p className="text-[10px] text-zinc-400 font-medium">Inicial</p>
                        <p className="text-sm font-bold text-zinc-700">{item.initial_score || 0}%</p>
                      </div>
                      <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-300" />
                      <div className="text-center">
                        <p className="text-[10px] text-zinc-400 font-medium">Final</p>
                        {isPending
                          ? <p className="text-sm font-black text-amber-500">—</p>
                          : <p className={cn('text-sm font-black', scoreColor)}>{item.final_score}%</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

// ─── CV Document Editor ───────────────────────────────────────────────────────

// DocSec MUST live outside CVDocumentEditor — defining it inside causes React to
// treat it as a new component type on every render, unmounting all children and losing focus.
const DocSec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-3 mb-3">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 whitespace-nowrap">{title}</h3>
      <div className="flex-1 h-px bg-indigo-100" />
    </div>
    {children}
  </div>
);

const CVDocumentEditor = memo(({ cv: propCv, onChange }: { cv: any; onChange: (cv: any) => void }) => {
  // Local state so parent re-renders don't kill focus on every keystroke
  const [cv, setCv] = useState(() => propCv);
  const [newTech, setNewTech] = useState('');
  const [newSoft, setNewSoft] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync from parent only when a brand-new adaptation is loaded (reference identity changes)
  const prevPropRef = useRef(propCv);
  useEffect(() => {
    if (propCv !== prevPropRef.current) {
      prevPropRef.current = propCv;
      setCv(propCv);
    }
  }, [propCv]);

  // Debounce parent notification so typing stays smooth
  const debounceRef = useRef<any>(null);
  const upd = useCallback((path: string[], value: any) => {
    setCv((prev: any) => {
      const u = JSON.parse(JSON.stringify(prev));
      let o = u; for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = value;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChangeRef.current(u), 300);
      return u;
    });
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900 px-8 py-6">
        <DocField value={cv.personal_info?.name || ''} onChange={v => upd(['personal_info', 'name'], v)}
          className="text-2xl font-bold text-white w-full" placeholder="Tu nombre" />
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-zinc-400 text-sm items-center">
          <DocField value={cv.personal_info?.email || ''} onChange={v => upd(['personal_info', 'email'], v)} placeholder="email" className="text-zinc-400 text-sm" />
          {cv.personal_info?.phone && <><span className="text-zinc-600">·</span><DocField value={cv.personal_info?.phone || ''} onChange={v => upd(['personal_info', 'phone'], v)} placeholder="teléfono" className="text-zinc-400 text-sm" /></>}
          {cv.personal_info?.location && <><span className="text-zinc-600">·</span><DocField value={cv.personal_info?.location || ''} onChange={v => upd(['personal_info', 'location'], v)} placeholder="ciudad" className="text-zinc-400 text-sm" /></>}
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6 space-y-6 text-sm text-zinc-800">
        {cv.personal_info?.summary && (
          <DocSec title="Resumen Profesional">
            <DocField value={cv.personal_info.summary} onChange={v => upd(['personal_info', 'summary'], v)} multiline className="text-zinc-700 leading-relaxed text-sm" placeholder="Resumen profesional..." />
          </DocSec>
        )}

        {cv.experience?.length > 0 && (
          <DocSec title="Experiencia Profesional">
            <div className="space-y-5">
              {cv.experience.map((exp: any, i: number) => (
                <div key={i}>
                  <div className="mb-1">
                    <DocField value={exp.position || ''} onChange={v => upd(['experience', String(i), 'position'], v)} className="font-bold text-zinc-900 w-full text-base" placeholder="Cargo" />
                    <div className="flex flex-wrap items-center gap-1 text-zinc-500 mt-0.5">
                      <DocField value={exp.company || ''} onChange={v => upd(['experience', String(i), 'company'], v)} className="text-zinc-600" placeholder="Empresa" />
                      <span>|</span>
                      <DocField value={exp.period || ''} onChange={v => upd(['experience', String(i), 'period'], v)} className="text-zinc-500" placeholder="Período" />
                    </div>
                  </div>
                  <div className="space-y-1 pl-3">
                    {exp.description?.map((d: string, j: number) => (
                      <div key={j} className="flex items-start gap-2 group">
                        <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                        <DocField value={d} onChange={v => { const a = [...exp.description]; a[j] = v; upd(['experience', String(i), 'description'], a); }} multiline className="flex-1 text-zinc-600" placeholder="Descripción..." />
                        <button onClick={() => upd(['experience', String(i), 'description'], exp.description.filter((_: any, k: number) => k !== j))}
                          className="opacity-0 group-hover:opacity-100 mt-0.5 w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-zinc-300 hover:text-red-400 transition-all shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => upd(['experience', String(i), 'description'], [...(exp.description || []), ''])}
                      className="text-xs text-indigo-500 font-semibold flex items-center gap-1 hover:text-indigo-700 mt-1">
                      <Plus className="w-3 h-3" /> Agregar punto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </DocSec>
        )}

        {cv.education?.length > 0 && (
          <DocSec title="Educación">
            <div className="space-y-3">
              {cv.education.map((edu: any, i: number) => (
                <div key={i}>
                  <DocField value={edu.degree || ''} onChange={v => upd(['education', String(i), 'degree'], v)} className="font-bold text-zinc-900 w-full text-base" placeholder="Título" />
                  <div className="flex flex-wrap items-center gap-1 text-zinc-500 mt-0.5">
                    <DocField value={edu.institution || ''} onChange={v => upd(['education', String(i), 'institution'], v)} className="text-zinc-600" placeholder="Institución" />
                    <span>|</span>
                    <DocField value={edu.period || ''} onChange={v => upd(['education', String(i), 'period'], v)} className="text-zinc-500" placeholder="Período" />
                  </div>
                  {edu.description?.length > 0 && (
                    <div className="mt-1 space-y-1 pl-3">
                      {edu.description.map((d: string, j: number) => (
                        <div key={j} className="flex items-start gap-2 group">
                          <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                          <DocField value={d} onChange={v => { const a = [...edu.description]; a[j] = v; upd(['education', String(i), 'description'], a); }} multiline className="flex-1 text-zinc-600" placeholder="Descripción..." />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DocSec>
        )}

        {(cv.skills?.technical?.length > 0 || cv.skills?.soft?.length > 0) && (
          <DocSec title="Habilidades">
            <div className="space-y-3">
              {(['technical', 'soft'] as const).map(type => (
                cv.skills[type]?.length > 0 && (
                  <div key={type} className="flex items-start gap-3">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider w-20 shrink-0 mt-1">{type === 'technical' ? 'Técnicas' : 'Blandas'}</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {cv.skills[type].map((s: string, i: number) => (
                        <span key={i} className="flex items-center gap-1 bg-zinc-100 rounded-full pl-3 pr-1.5 py-1 text-xs font-semibold">
                          {s}
                          <button onClick={() => upd(['skills', type], cv.skills[type].filter((_: any, j: number) => j !== i))}
                            className="w-3.5 h-3.5 rounded-full hover:bg-zinc-300 flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                        </span>
                      ))}
                      <div className="flex gap-1">
                        <input value={type === 'technical' ? newTech : newSoft}
                          onChange={e => type === 'technical' ? setNewTech(e.target.value) : setNewSoft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { const v = type === 'technical' ? newTech : newSoft; if (v) { upd(['skills', type], [...(cv.skills[type] || []), v]); type === 'technical' ? setNewTech('') : setNewSoft(''); } } }}
                          placeholder="+ agregar" className="text-xs border border-dashed border-zinc-300 rounded-full px-3 py-1 outline-none focus:border-indigo-400 w-24 bg-transparent" />
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          </DocSec>
        )}

        {(cv.others?.languages || cv.others?.tools || cv.others?.additional) && (
          <DocSec title="Información Adicional">
            <div className="space-y-1">
              {cv.others?.languages && <div className="flex gap-3"><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider w-20 shrink-0 mt-0.5">Idiomas</span><DocField value={cv.others.languages} onChange={v => upd(['others', 'languages'], v)} className="text-zinc-600 flex-1" placeholder="Idiomas..." /></div>}
              {cv.others?.tools && <div className="flex gap-3"><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider w-20 shrink-0 mt-0.5">Tools</span><DocField value={cv.others.tools} onChange={v => upd(['others', 'tools'], v)} className="text-zinc-600 flex-1" placeholder="Herramientas..." /></div>}
              {cv.others?.additional && <div className="flex gap-3"><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider w-20 shrink-0 mt-0.5">Otro</span><DocField value={cv.others.additional} onChange={v => upd(['others', 'additional'], v)} multiline className="text-zinc-600 flex-1" placeholder="Información adicional..." /></div>}
            </div>
          </DocSec>
        )}
      </div>
      <div className="px-8 py-3 bg-zinc-50 border-t border-zinc-100">
        <p className="text-xs text-zinc-400 flex items-center gap-1.5"><Edit2 className="w-3 h-3" /> Haz click en cualquier campo para editar directamente</p>
      </div>
    </div>
  );
});

// ─── Match Analysis Panel ─────────────────────────────────────────────────────

const MatchAnalysisPanel = ({ initialMatch, analysis }: { initialMatch: any; analysis: any }) => {
  const initial = initialMatch?.score ?? analysis?.match_score_original ?? 0;
  const final = analysis?.match_score_adapted ?? 0;
  const improvement = final - initial;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Análisis de mejoras</h3>

      {/* Score comparison */}
      <div className="flex items-center justify-center gap-4">
        <div className="text-center">
          <ScoreRing score={initial} size={80} />
          <p className="text-xs font-bold text-zinc-400 mt-2">Match inicial</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ArrowRight className="w-5 h-5 text-zinc-300" />
          <span className={cn('text-base font-black', improvement > 0 ? 'text-emerald-600' : 'text-zinc-400')}>
            {improvement > 0 ? '+' : ''}{improvement}%
          </span>
        </div>
        <div className="text-center">
          <ScoreRing score={final} size={80} />
          <p className="text-xs font-bold text-zinc-400 mt-2">Match final</p>
        </div>
      </div>

      {/* Summary of changes */}
      {analysis?.summary_adapted && (
        <div className="p-3 bg-zinc-50 rounded-xl">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-1.5">Qué se hizo</p>
          <p className="text-xs text-zinc-600 leading-relaxed">{analysis.summary_adapted}</p>
        </div>
      )}

      {/* Keywords added */}
      {analysis?.keywords_usadas?.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Keywords incorporadas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.keywords_usadas.map((k: string, i: number) => <Badge key={i} color="green">{k}</Badge>)}
          </div>
        </div>
      )}

      {/* Still missing */}
      {analysis?.missing_keywords?.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Sigue faltando
          </p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missing_keywords.map((k: string, i: number) => <Badge key={i} color="orange">{k}</Badge>)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Export Step ──────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, { label: string; color: string }> = {
  tecnica:    { label: 'Técnica',         color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  conductual: { label: 'Conductual',      color: 'bg-violet-50 text-violet-700 border-violet-200' },
  cargo:      { label: 'Específica del cargo', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const ExportStep = ({ cv, analysis, language, cvText, jdText, onBack }: {
  cv: any; analysis: any; language: string; cvText: string; jdText: string; onBack: () => void;
}) => {
  const [selected, setSelected] = useState<'classic' | 'modern'>('classic');
  const [questions, setQuestions] = useState<{ tipo: string; pregunta: string; tip: string }[]>([]);
  const [loadingQ, setLoadingQ] = useState(false);
  const [qError, setQError] = useState('');
  const [qLoaded, setQLoaded] = useState(false);

  const loadQuestions = async () => {
    if (qLoaded || loadingQ) return;
    setLoadingQ(true); setQError('');
    try {
      const res = await getInterviewQuestions(cvText, jdText);
      setQuestions(res.questions || []);
      setQLoaded(true);
    } catch {
      setQError('No se pudieron cargar las preguntas. Intenta de nuevo.');
    } finally { setLoadingQ(false); }
  };

  // Load questions automatically when step mounts
  React.useEffect(() => { loadQuestions(); }, []);

  const templates = [
    { id: 'classic' as const, name: 'Clásico', desc: 'Diseño limpio con header en color. Ideal para cargos corporativos.', preview: '🔵' },
    { id: 'modern' as const, name: 'Moderno', desc: 'Sidebar oscuro con diseño editorial. Para roles creativos o tech.', preview: '🖤' },
  ];

  const sugerencias = Array.isArray(analysis?.sugerencias_revision)
    ? analysis.sugerencias_revision.filter((s: any) => s?.agregado)
    : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Score card */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-1">Resultado final</p>
            <h3 className="text-xl sm:text-2xl font-black text-zinc-900">{analysis?.match_score_adapted || 0}% match</h3>
            <p className="text-sm text-zinc-500 mt-1">{analysis?.summary_adapted || ''}</p>
          </div>
          <ScoreRing score={analysis?.match_score_adapted || 0} size={80} />
        </div>
        {analysis?.cannot_improve && analysis?.missing_mandatory?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-amber-100 bg-amber-50 rounded-xl p-4">
            <p className="text-sm font-bold text-amber-800 mb-2">⚠️ No es posible lograr una mayor adaptación</p>
            <p className="text-xs text-amber-700 mb-2">Estos requisitos obligatorios de la oferta no se pueden cubrir sin inventar información:</p>
            <ul className="space-y-1">
              {analysis.missing_mandatory.map((req: string, i: number) => (
                <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5"><span className="shrink-0">•</span>{req}</li>
              ))}
            </ul>
          </div>
        )}
        {analysis?.keywords_usadas?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">Keywords incorporadas</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.keywords_usadas.map((k: string, i: number) => <Badge key={i} color="indigo">{k}</Badge>)}
            </div>
          </div>
        )}
      </Card>

      {/* Suggestions to review */}
      {sugerencias.length > 0 && (
        <Card className="p-4 sm:p-6 border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-lg">👁️</span>
            <div>
              <p className="text-sm font-black text-amber-900">Contenido inferido — revisa antes de enviar</p>
              <p className="text-xs text-amber-700 mt-0.5">
                La IA agregó estas frases basándose en tu experiencia. Son razonables pero no estaban en tu CV original.
                Descarga el Word, revísalas y mantén solo las que apliquen a ti.
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            {sugerencias.map((s: any, i: number) => (
              <div key={i} className="bg-white rounded-xl border border-amber-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">{s.seccion}</span>
                </div>
                <p className="text-sm text-zinc-800 font-medium">"{s.agregado}"</p>
                <p className="text-xs text-zinc-500 mt-1">{s.razon}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Template picker */}
      <div>
        <p className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-3">Elige tu template</p>
        <div className="grid grid-cols-2 gap-4">
          {templates.map(t => (
            <button key={t.id} onClick={() => setSelected(t.id)}
              className={cn('p-5 rounded-2xl border-2 text-left transition-all', selected === t.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-zinc-100 bg-white hover:border-zinc-300')}>
              <span className="text-3xl mb-3 block">{t.preview}</span>
              <p className="font-black text-zinc-900">{t.name}</p>
              <p className="text-xs text-zinc-500 mt-1">{t.desc}</p>
              {selected === t.id && <div className="mt-2 flex items-center gap-1 text-indigo-600"><CheckCircle2 className="w-4 h-4" /><span className="text-xs font-bold">Seleccionado</span></div>}
            </button>
          ))}
        </div>
      </div>

      {/* Download buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Editar CV</Button>
        <Button className="flex-1" onClick={() => selected === 'classic' ? generateClassicPDF(cv, language) : generateModernPDF(cv, language)}>
          <Download className="w-4 h-4" /> Descargar PDF {selected === 'classic' ? 'Clásico' : 'Moderno'}
        </Button>
        <Button variant="secondary" onClick={() => generateWordDoc(cv, language)}>
          <FileText className="w-4 h-4" /> Word (.docx)
        </Button>
      </div>
      <p className="text-xs text-zinc-400 text-center">El archivo Word te permite editar el CV en Microsoft Word o Google Docs</p>

      {/* Interview questions */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <span className="text-sm">💬</span>
          </div>
          <div>
            <p className="font-black text-zinc-900 text-sm">Preguntas de entrevista para este cargo</p>
            <p className="text-xs text-zinc-500">Generadas en base al cargo y tu experiencia específica</p>
          </div>
        </div>

        {loadingQ && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm py-4">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <Loader2 className="w-4 h-4" />
            </motion.div>
            Generando preguntas personalizadas…
          </div>
        )}

        {qError && !loadingQ && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-red-600 flex-1">{qError}</p>
            <Button variant="outline" onClick={loadQuestions}>Reintentar</Button>
          </div>
        )}

        {!loadingQ && !qError && questions.length > 0 && (
          <div className="space-y-3">
            {(['tecnica', 'conductual', 'cargo'] as const).map(tipo => {
              const grupo = questions.filter(q => q.tipo === tipo);
              if (!grupo.length) return null;
              const meta = TIPO_LABEL[tipo];
              return (
                <div key={tipo}>
                  <span className={cn('inline-block text-[10px] font-black uppercase tracking-widest border rounded-full px-2.5 py-0.5 mb-2', meta.color)}>
                    {meta.label}
                  </span>
                  <div className="space-y-2">
                    {grupo.map((q, i) => (
                      <div key={i} className="bg-zinc-50 rounded-xl px-4 py-3 border border-zinc-100">
                        <p className="text-sm font-semibold text-zinc-800">{q.pregunta}</p>
                        {q.tip && (
                          <p className="text-xs text-indigo-600 mt-1.5 flex items-start gap-1">
                            <span className="shrink-0 font-bold">💡</span> {q.tip}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Admin Panel ──────────────────────────────────────────────────────────────

const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const [tab, setTab] = useState<'overview' | 'users' | 'packages'>('overview');
  const [users, setUsers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [adaptations, setAdaptations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const [pkgForm, setPkgForm] = useState({ name: '', credits: 0, price: 0 });
  const [creditModal, setCreditModal] = useState<{ userId: string; email: string; name: string; current: number } | null>(null);
  const [newCredits, setNewCredits] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [u, pkg, pur, adp] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }),
      supabase.from('adaptations').select('id, user_id, initial_score, final_score, created_at'),
    ]);
    setUsers(u.data || []);
    setPackages(pkg.data || []);
    setPurchases(pur.data || []);
    setAdaptations(adp.data || []);
    setLoading(false);
  };

  // Exclude admin-granted (price=0 with note) from financial stats
  const realPurchases = purchases.filter(p => p.price > 0 && p.status === 'approved');
  const adminGrants = purchases.filter(p => p.price === 0);
  const totalRevenue = realPurchases.reduce((a, p) => a + (p.price || 0), 0);
  const totalCredits = realPurchases.reduce((a, p) => a + (p.credits || 0), 0);
  const initialMatchCount = adaptations.filter(a => a.initial_score > 0).length;
  const fullAdaptCount = adaptations.filter(a => a.final_score > 0).length;
  const activeUsers = users.filter(u => u.last_active_at && new Date(u.last_active_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;

  const grantCredits = async () => {
    if (!creditModal || !newCredits) return;
    setSaving(true);
    const amount = parseInt(newCredits);
    const pkg = packages.find(p => p.credits === amount) || packages[0];
    await supabase.from('purchases').insert({
      user_id: creditModal.userId,
      package_id: pkg?.id || null,
      credits: amount,
      price: 0,
      note: note || `Otorgado por admin`,
    });
    await supabase.from('profiles').update({ credits: creditModal.current + amount }).eq('id', creditModal.userId);
    setCreditModal(null); setNewCredits(''); setNote('');
    setSaving(false);
    await loadAll();
  };

  const savePackage = async (id: string) => {
    setSaving(true);
    await supabase.from('packages').update({ name: pkgForm.name, credits: pkgForm.credits, price: pkgForm.price }).eq('id', id);
    setEditingPkg(null);
    setSaving(false);
    await loadAll();
  };

  const addPackage = async () => {
    await supabase.from('packages').insert({ name: 'Nuevo paquete', credits: 5, price: 4990, sort_order: packages.length + 1 });
    await loadAll();
  };

  const togglePackage = async (id: string, active: boolean) => {
    await supabase.from('packages').update({ active: !active }).eq('id', id);
    await loadAll();
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
            <div><h2 className="text-xl font-black text-zinc-900">Panel de Administración</h2><p className="text-sm text-zinc-500">CV Matcher Pro</p></div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-zinc-100"><X className="w-5 h-5 text-zinc-500" /></button>
        </div>

        <div className="flex border-b border-zinc-100 px-6">
          {([['overview', 'Resumen', TrendingUp], ['users', 'Usuarios', Users], ['packages', 'Paquetes', Package]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn('flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all', tab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700')}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? <div className="text-center py-12 text-zinc-400">Cargando datos...</div> : (
            <>
              {tab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Total usuarios', value: users.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
                      { label: 'Usuarios activos (7d)', value: activeUsers, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { label: 'Matches iniciales', value: initialMatchCount, icon: Target, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      { label: 'CVs optimizados', value: fullAdaptCount, icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50' },
                    ].map((s, i) => (
                      <Card key={i} className="p-5">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', s.bg)}>
                            <s.icon className={cn('w-5 h-5', s.color)} />
                          </div>
                          <div><p className="text-2xl font-black text-zinc-900">{s.value}</p><p className="text-xs text-zinc-500">{s.label}</p></div>
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-600" /></div>
                        <div><p className="text-2xl font-black text-zinc-900">{formatCLP(totalRevenue)}</p><p className="text-xs text-zinc-500">Ingresos totales</p></div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-zinc-500">Compras realizadas</span><span className="font-bold">{realPurchases.length}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-zinc-500">Créditos vendidos</span><span className="font-bold">{totalCredits}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-zinc-500">Créditos otorgados (admin)</span><span className="font-bold text-indigo-600">{adminGrants.reduce((a, p) => a + p.credits, 0)}</span></div>
                      </div>
                    </Card>
                    <Card className="p-5">
                      <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-3">Últimas compras reales</h3>
                      {realPurchases.slice(0, 4).map((p, i) => {
                        const u = users.find(u => u.id === p.user_id);
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                            <span className="text-zinc-600 truncate max-w-[160px]">{u?.email || 'Usuario'}</span>
                            <div className="flex items-center gap-2">
                              <Badge color="indigo">{p.credits} créditos</Badge>
                              <span className="font-bold text-zinc-900">{formatCLP(p.price)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                  </div>
                </div>
              )}

              {tab === 'users' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                      placeholder="Buscar por nombre o email..."
                      className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
                  </div>
                  <div className="divide-y divide-zinc-100 border border-zinc-100 rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-5 gap-4 px-4 py-3 bg-zinc-50 text-xs font-black uppercase tracking-widest text-zinc-400">
                      <span className="col-span-2">Usuario</span><span>Créditos</span><span>Adaptaciones</span><span>Acciones</span>
                    </div>
                    {users
                      .filter(u => {
                        if (!userSearch) return true;
                        const q = userSearch.toLowerCase();
                        return u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q);
                      })
                      .map(u => {
                        const userAdapts = adaptations.filter((a: any) => a.user_id === u.id);
                        const userAdaptsDone = userAdapts.filter(a => a.final_score > 0).length;
                        return (
                          <div key={u.id} className="grid grid-cols-5 gap-4 px-4 py-3 items-center hover:bg-zinc-50">
                            <div className="col-span-2 min-w-0">
                              {u.full_name && <p className="font-semibold text-zinc-900 truncate text-sm">{u.full_name}</p>}
                              <p className={cn('truncate text-sm', u.full_name ? 'text-zinc-400 text-xs' : 'font-semibold text-zinc-900')}>{u.email}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-zinc-400">{new Date(u.created_at).toLocaleDateString('es-CL')}</p>
                                {u.is_admin && <Badge color="indigo">Admin</Badge>}
                              </div>
                            </div>
                            <div>
                              <span className={cn('text-sm font-black', u.credits <= 2 ? 'text-red-500' : 'text-zinc-900')}>{u.credits}</span>
                            </div>
                            <div className="text-sm text-zinc-500">
                              <span className="font-bold text-zinc-900">{userAdaptsDone}</span>
                              <span className="text-zinc-400"> / {userAdapts.length}</span>
                              <p className="text-xs text-zinc-400">completas / total</p>
                            </div>
                            <div>
                              <Button size="sm" variant="outline" onClick={() => setCreditModal({ userId: u.id, email: u.email, name: u.full_name || u.email, current: u.credits })}>
                                <Plus className="w-3.5 h-3.5" /> Créditos
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {tab === 'packages' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={addPackage}><Plus className="w-4 h-4" /> Nuevo paquete</Button>
                  </div>
                  {packages.map(pkg => (
                    <div key={pkg.id} className={cn('p-5 border-2 rounded-2xl', pkg.active ? 'border-zinc-100' : 'border-zinc-100 opacity-60')}>
                      {editingPkg === pkg.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nombre</label>
                              <input value={pkgForm.name} onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))}
                                className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></div>
                            <div><label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Créditos</label>
                              <input type="number" value={pkgForm.credits} onChange={e => setPkgForm(f => ({ ...f, credits: parseInt(e.target.value) || 0 }))}
                                className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></div>
                            <div><label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Precio (CLP)</label>
                              <input type="number" value={pkgForm.price} onChange={e => setPkgForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                                className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => savePackage(pkg.id)} loading={saving}><Save className="w-3.5 h-3.5" /> Guardar</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPkg(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-black text-zinc-900">{pkg.name}</p>
                            <p className="text-sm text-zinc-500">{pkg.credits} créditos · {formatCLP(pkg.price)} · {formatCLP(Math.round(pkg.price / pkg.credits))} por crédito</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setEditingPkg(pkg.id); setPkgForm({ name: pkg.name, credits: pkg.credits, price: pkg.price }); }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-500"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => togglePackage(pkg.id, pkg.active)}
                              className={cn('text-xs font-bold px-3 py-1.5 rounded-lg', pkg.active ? 'bg-zinc-100 text-zinc-600 hover:bg-red-50 hover:text-red-500' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100')}>
                              {pkg.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Grant credits modal */}
      {creditModal && (
        <div className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-black text-zinc-900 mb-1">Otorgar créditos</h3>
            <p className="text-sm text-zinc-500 mb-4">{creditModal.name !== creditModal.email ? `${creditModal.name} · ` : ''}{creditModal.email} · Tiene {creditModal.current} créditos</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Cantidad de créditos</label>
                <input type="number" value={newCredits} onChange={e => setNewCredits(e.target.value)} placeholder="Ej: 10"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nota (opcional)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ej: Pago transferencia"
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={() => setCreditModal(null)} size="sm">Cancelar</Button>
                <Button className="flex-1" onClick={grantCredits} loading={saving} size="sm">
                  <Check className="w-4 h-4" /> Confirmar
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'workflow'>('dashboard');
  const alreadyLoggedInRef = useRef(false);

  const [step, setStep] = useState(0);
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  const [language, setLanguage] = useState('Español');
  const [initialMatch, setInitialMatch] = useState<any>(null);
  const [adaptedCV, setAdaptedCV] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCVManager, setShowCVManager] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const steps = ['Preparación', 'Match Inicial', 'Idioma', 'Adaptación', 'Exportar'];
  const credits = profile?.credits ?? 0;
  const isAdmin = profile?.is_admin ?? false;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        alreadyLoggedInRef.current = true;
        loadProfile(session.user.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
        supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', session.user.id);
        // Only redirect to dashboard on genuine new sign-in (not on tab-focus session restore)
        if (event === 'SIGNED_IN' && !alreadyLoggedInRef.current) setView('dashboard');
        alreadyLoggedInRef.current = true;
      } else {
        alreadyLoggedInRef.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Handle Mercado Pago return — show toast and clean URL
  const [paymentToast, setPaymentToast] = useState<'success' | 'pending' | 'failure' | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success' || payment === 'pending' || payment === 'failure') {
      setPaymentToast(payment as any);
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname);
      // Reload credits after successful payment
      if (payment === 'success') {
        setTimeout(() => {
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) loadProfile(user.id);
          });
        }, 3000); // wait for webhook to process
      }
      setTimeout(() => setPaymentToast(null), 6000);
    }
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
    } else {
      // Create profile if trigger didn't fire yet
      const u = (await supabase.auth.getUser()).data.user;
      if (u) {
        await supabase.from('profiles').insert({
          id: u.id, email: u.email,
          full_name: u.user_metadata?.full_name || '',
          credits: u.email === 'mackennapablo@hotmail.com' ? 9999 : 2,
          is_admin: u.email === 'mackennapablo@hotmail.com',
        });
        const { data: p2 } = await supabase.from('profiles').select('*').eq('id', u.id).single();
        if (p2) setProfile(p2);
      }
    }
  };

  const resetWorkflow = () => {
    setStep(0); setCvText(''); setJdText(''); setLanguage('Español');
    setInitialMatch(null); setAdaptedCV(null); setAnalysis(null);
    setError(null); setProgress(0); setLoadingMsg('');
    initialMatchRecordId.current = null;
  };

  const startNewWorkflow = () => {
    if (credits <= 0) { setShowPackages(true); return; }
    resetWorkflow(); setView('workflow');
  };

  const loadFromHistory = (item: any) => {
    setCvText(item.cv_text || ''); setJdText(item.job_description || '');
    setLanguage(item.language || 'Español');
    setInitialMatch(item.initial_match || null);
    setError(null);

    const isComplete = item.final_score > 0 && item.adapted_content;
    if (isComplete) {
      // Adaptation done → go straight to results
      setAdaptedCV(item.adapted_content);
      setAnalysis(item.analysis || null);
      initialMatchRecordId.current = null;
      setStep(3);
    } else {
      // Only initial match saved → resume from step 1 so user can continue
      setAdaptedCV(null);
      setAnalysis(null);
      initialMatchRecordId.current = item.id; // reuse existing DB record
      freeRetryRef.current = true; // don't charge credit — initial attempt already consumed it (or never finished)
      setStep(1);
    }
    setView('workflow');
  };

  // Ref to track the initial-match-only DB record so we can update it later when adaptation completes
  const initialMatchRecordId = useRef<string | null>(null);
  // When user retries a previously failed adaptation (final_score=0), don't charge credit
  const freeRetryRef = useRef(false);

  const handleCalcMatch = async () => {
    if (!cvText.trim() || !jdText.trim()) { setError('Necesitas un CV y una descripción del cargo.'); return; }
    setIsProcessing(true); setError(null); setProgress(10); setLoadingMsg('Preparando análisis...');
    let timer: any = null;
    try {
      setProgress(20); setLoadingMsg('Analizando compatibilidad...');
      let fake = 20;
      timer = setInterval(() => { fake = Math.min(fake + 5, 80); setProgress(fake); }, 500);
      const match = await getInitialMatch(cvText, jdText);
      clearInterval(timer); timer = null;
      setProgress(100); setLoadingMsg('¡Análisis completo!');
      setInitialMatch(match);
      // Save initial match record immediately (no final_score yet)
      if (user) {
        const detectedTitle = match?.job_title || getJobTitle(jdText);
        const { data } = await supabase.from('adaptations').insert({
          user_id: user.id, job_title: detectedTitle, job_description: jdText,
          cv_text: cvText, language, initial_match: match,
          initial_score: match?.score || 0, final_score: 0,
        }).select('id').single();
        initialMatchRecordId.current = data?.id || null;
      }
      setStep(1);
    } catch (err: any) { setError(err.message); }
    finally { if (timer) clearInterval(timer); setIsProcessing(false); setProgress(0); setLoadingMsg(''); }
  };

  const handleAdapt = async () => {
    if (credits <= 0 && !isAdmin) { setShowPackages(true); return; }
    setIsProcessing(true); setError(null); setProgress(10); setLoadingMsg('Analizando CV y descripción...');
    let timer: any = null;
    try {
      setProgress(20); setLoadingMsg('Optimizando keywords para ATS...');
      let fake = 20;
      timer = setInterval(() => {
        fake = Math.min(fake + 3, 75);
        setProgress(fake);
        if (fake < 35) setLoadingMsg('Optimizando keywords para ATS...');
        else if (fake < 60) setLoadingMsg('Generando CV adaptado...');
        else setLoadingMsg('Aplicando mejoras finales...');
      }, 600);
      const result = await adaptCV(cvText, jdText, language);
      clearInterval(timer); timer = null;
      setProgress(88); setLoadingMsg('Guardando resultado...');
      const normalized = normalizeCV(result?.cv_adaptado || result);

      // Guardrail: adapted score must ALWAYS be at least initialScore + 2
      const initialScore = initialMatch?.score || result?.analisis?.match_score_original || 0;
      const rawAdapted = result?.analisis?.match_score_adapted || 0;
      const guardedAdapted = Math.max(initialScore + 2, rawAdapted);
      const guardedAnalysis = result?.analisis
        ? { ...result.analisis, match_score_adapted: guardedAdapted }
        : null;

      setAdaptedCV(normalized);
      setAnalysis(guardedAnalysis);
      setProgress(100);

      if (user) {
        const finalScore = guardedAdapted;
        const hasValidResult = finalScore > 0 && normalized?.personal_info?.name;

        if (initialMatchRecordId.current) {
          await supabase.from('adaptations').update({
            language, final_score: finalScore,
            adapted_content: normalized, analysis: guardedAnalysis,
          }).eq('id', initialMatchRecordId.current);
        } else {
          await supabase.from('adaptations').insert({
            user_id: user.id, job_title: initialMatch?.job_title || getJobTitle(jdText), job_description: jdText,
            cv_text: cvText, language, initial_match: initialMatch,
            initial_score: initialMatch?.score || 0, final_score: finalScore,
            adapted_content: normalized, analysis: guardedAnalysis,
          });
        }
        initialMatchRecordId.current = null;

        // Only consume credit if result is valid AND it's not a free retry of a failed adaptation
        if (!isAdmin && hasValidResult && !freeRetryRef.current) {
          const newCredits = Math.max(0, credits - 1);
          await supabase.from('profiles').update({ credits: newCredits }).eq('id', user.id);
          setProfile((p: any) => ({ ...p, credits: newCredits }));
        }
        freeRetryRef.current = false;
      }
      setStep(3);
    } catch (err: any) { setError(err.message); }
    finally { if (timer) clearInterval(timer); setIsProcessing(false); setProgress(0); setLoadingMsg(''); }
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return <AuthScreen onAuth={() => setView('dashboard')} />;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => { setView('dashboard'); resetWorkflow(); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center"><Zap className="w-4 h-4 text-white fill-white" /></div>
            <span className="font-black text-zinc-900 tracking-tight">CV Matcher Pro</span>
          </button>
          <div className="flex items-center gap-3">
            {view === 'workflow' && step < 4 && (
              <button onClick={() => { setView('dashboard'); resetWorkflow(); }} className="text-sm text-zinc-500 hover:text-zinc-900 font-medium transition-colors flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" /> Dashboard
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-xl">
              <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-sm font-black text-indigo-700">{isAdmin ? '∞' : credits}</span>
            </div>
            {isAdmin && (
              <button onClick={() => setShowAdmin(true)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors">
                <Shield className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-xs font-black text-indigo-700">{(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}</span>
              </div>
              <span className="font-medium hidden sm:block">{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
            </div>
            <button onClick={() => signOut()} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Loading bar */}
      {isProcessing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-zinc-100">
          <motion.div className="h-full bg-indigo-600" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>
      )}

      {/* Payment toast */}
      <AnimatePresence>
        {paymentToast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={cn('fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 text-sm font-bold',
              paymentToast === 'success' ? 'bg-emerald-600 text-white' :
              paymentToast === 'pending' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white')}>
            {paymentToast === 'success' ? <><CheckCircle2 className="w-5 h-5" /> ¡Pago confirmado! Tus créditos se actualizarán en breve.</> :
             paymentToast === 'pending' ? <><Clock className="w-5 h-5" /> Pago en proceso. Te avisaremos cuando se confirme.</> :
             <><AlertCircle className="w-5 h-5" /> El pago no se completó. Intenta nuevamente.</>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {view === 'dashboard' ? (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black mb-1">Hola, {user.user_metadata?.full_name?.split(' ')[0] || 'bienvenido'} 👋</h1>
                  <p className="text-indigo-200 text-sm sm:text-base">Adapta tu CV a cualquier cargo en minutos</p>
                </div>
                <Button variant="white" size="lg" onClick={startNewWorkflow} className="w-full sm:w-auto justify-center"><Plus className="w-5 h-5" /> Nueva adaptación</Button>
              </div>
            </div>
            <CreditsBanner credits={credits} onBuy={() => setShowPackages(true)} />
            <Dashboard userId={user.id} credits={credits} onLoadAdaptation={loadFromHistory} onNew={startNewWorkflow} onBuy={() => setShowPackages(true)} />
          </motion.div>
        ) : (
          <motion.div key="workflow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            <Stepper currentStep={step} steps={steps} />

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="step0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                  <div className="text-center mb-6 sm:mb-10">
                    <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 mb-2">Prepara tu <span className="text-indigo-600 italic font-serif">postulación</span></h2>
                    <p className="text-zinc-500 font-medium text-sm sm:text-base">Sube tu CV y pega la descripción del cargo para comenzar</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                    <Card>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-6 h-6 bg-zinc-900 rounded-lg flex items-center justify-center text-white text-xs font-black">01</span>
                        <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Tu CV Maestro</span>
                      </div>
                      {cvText ? (
                        <div className="text-center py-6">
                          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                          <p className="font-bold text-zinc-900 text-sm mb-3">CV cargado ({cvText.length.toLocaleString()} chars)</p>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowCVManager(true)}><RefreshCw className="w-3.5 h-3.5" /> Cambiar</Button>
                            <Button variant="danger" size="sm" onClick={() => setCvText('')}><X className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Upload className="w-6 h-6 text-zinc-400" /></div>
                          <p className="font-bold text-zinc-900 mb-1">Sube tu CV</p>
                          <p className="text-xs text-zinc-400 mb-4">PDF · Máx 5MB</p>
                          <Button variant="black" size="sm" onClick={() => setShowCVManager(true)}>
                            <Layers className="w-4 h-4" /> Mis CVs
                          </Button>
                        </div>
                      )}
                    </Card>
                    <Card noPadding className="flex flex-col">
                      <div className="p-5 pb-3">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-6 h-6 bg-zinc-900 rounded-lg flex items-center justify-center text-white text-xs font-black">02</span>
                          <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Descripción del cargo</span>
                        </div>
                      </div>
                      <textarea value={jdText} onChange={e => setJdText(e.target.value)} placeholder="Pega aquí los requisitos, responsabilidades y descripción del cargo..."
                        className="flex-1 min-h-[200px] px-5 pb-5 text-sm text-zinc-700 outline-none resize-none placeholder:text-zinc-300 font-medium" />
                    </Card>
                  </div>
                  {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0" />{error}
                    </motion.div>
                  )}
                  {isProcessing && progress > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-5 bg-indigo-50 border border-indigo-100 rounded-2xl">
                      <ProgressBar progress={progress} label={loadingMsg || 'Analizando...'} />
                    </motion.div>
                  )}
                  <div className="flex justify-center">
                    <Button size="lg" onClick={handleCalcMatch} loading={isProcessing} disabled={!cvText || !jdText} className="px-12">
                      Calcular Match <Target className="w-5 h-5" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 1 && initialMatch && (
                <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                  <div className="text-center mb-6 sm:mb-8">
                    <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 mb-2">Tu match <span className="text-indigo-600 italic font-serif">inicial</span></h2>
                    <p className="text-zinc-500 font-medium text-sm sm:text-base">Así está tu CV vs este cargo actualmente</p>
                  </div>

                  {initialMatch.score >= 90 && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="max-w-2xl mx-auto mb-5 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl flex items-start gap-3">
                      <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                        <Star className="w-4 h-4 text-white fill-white" />
                      </div>
                      <div>
                        <p className="font-black text-emerald-800 text-sm">¡Candidato ideal detectado!</p>
                        <p className="text-emerald-700 text-xs mt-1 leading-relaxed">
                          Con un {initialMatch.score}% de match ya eres un candidato muy fuerte para este cargo.
                          <strong className="ml-1">No recomendamos optimizar el CV</strong> — subir más el score es muy difícil y los pequeños cambios pueden distorsionar tu perfil real.
                          Considera postular directamente con tu CV actual.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  <Card className="max-w-2xl mx-auto">
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 mb-6">
                      <ScoreRing score={initialMatch.score} size={110} />
                      <div className="flex-1 text-center sm:text-left">
                        <p className="font-black text-zinc-900 text-lg mb-2">
                          {initialMatch.score >= 90 ? '¡Match excepcional!' : initialMatch.score >= 70 ? '¡Buen match!' : initialMatch.score >= 50 ? 'Match moderado' : 'Match bajo'}
                        </p>
                        <p className="text-zinc-600 text-sm leading-relaxed">{initialMatch.summary}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Puntos fuertes</p>
                        <ul className="space-y-1.5">{initialMatch.key_matches?.map((m: string, i: number) => <li key={i} className="text-xs text-zinc-600 bg-emerald-50 rounded-xl px-3 py-2 font-medium">{m}</li>)}</ul>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-red-500 mb-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Brechas</p>
                        <ul className="space-y-1.5">{initialMatch.key_gaps?.map((g: string, i: number) => <li key={i} className="text-xs text-zinc-600 bg-red-50 rounded-xl px-3 py-2 font-medium">{g}</li>)}</ul>
                      </div>
                    </div>
                  </Card>
                  <div className="flex justify-center gap-4 mt-6 sm:mt-8">
                    <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft className="w-4 h-4" /> Volver</Button>
                    <Button size="lg" onClick={() => setStep(2)}>Continuar <ArrowRight className="w-4 h-4" /></Button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                  <div className="text-center mb-6 sm:mb-10">
                    <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 mb-2">Idioma del <span className="text-indigo-600 italic font-serif">CV adaptado</span></h2>
                    <p className="text-zinc-500 font-medium text-sm sm:text-base">¿En qué idioma quieres el CV resultante?</p>
                  </div>
                  {credits <= 0 && !isAdmin && (
                    <div className="max-w-md mx-auto mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-red-700">Sin adaptaciones disponibles</p>
                        <button onClick={() => setShowPackages(true)} className="text-xs text-red-600 underline font-medium">Ver paquetes</button>
                      </div>
                    </div>
                  )}
                  <div className="max-w-md mx-auto">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      {['Español', 'Inglés'].map(lang => (
                        <button key={lang} onClick={() => setLanguage(lang)}
                          className={cn('p-6 rounded-2xl border-2 text-center transition-all', language === lang ? 'border-indigo-600 bg-indigo-50' : 'border-zinc-100 bg-white hover:border-zinc-300')}>
                          <Globe className={cn('w-8 h-8 mx-auto mb-2', language === lang ? 'text-indigo-600' : 'text-zinc-400')} />
                          <p className={cn('font-black text-lg', language === lang ? 'text-indigo-700' : 'text-zinc-700')}>{lang}</p>
                        </button>
                      ))}
                    </div>
                    {error && <p className="text-red-500 text-sm font-medium mb-4 text-center">{error}</p>}
                    {isProcessing && progress > 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 p-5 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
                        <ProgressBar progress={progress} label={loadingMsg || 'Procesando...'} />
                        <div className="space-y-1.5">
                          {[
                            { label: 'Analizando CV y descripción', done: progress >= 20 },
                            { label: 'Optimizando keywords para ATS', done: progress >= 50 },
                            { label: 'Generando CV adaptado', done: progress >= 80 },
                            { label: 'Guardando resultado', done: progress >= 100 },
                          ].map((s, i) => (
                            <div key={i} className={cn('flex items-center gap-2 text-xs', s.done ? 'text-emerald-700' : 'text-zinc-400')}>
                              {s.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 border-2 border-current rounded-full border-t-transparent animate-spin" />}
                              {s.label}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4" /> Volver</Button>
                      <Button className="flex-1" size="lg" onClick={handleAdapt} loading={isProcessing} disabled={credits <= 0 && !isAdmin}>
                        {isProcessing ? '' : 'Adaptar CV con IA'} {!isProcessing && <Zap className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && adaptedCV && (
                <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-zinc-900">CV <span className="text-indigo-600 italic font-serif">adaptado</span></h2>
                      <p className="text-zinc-500 text-sm mt-1">Edita directamente · haz click en cualquier campo</p>
                    </div>
                    <Button onClick={() => setStep(4)} className="w-full sm:w-auto justify-center">Exportar <Download className="w-4 h-4" /></Button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2">
                      <CVDocumentEditor cv={adaptedCV} onChange={setAdaptedCV} />
                    </div>
                    <div className="lg:col-span-1 lg:sticky lg:top-20">
                      <MatchAnalysisPanel initialMatch={initialMatch} analysis={analysis} />
                    </div>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4" /> Volver</Button>
                    <Button className="flex-1" onClick={() => setStep(4)}>Ir a exportar <Download className="w-4 h-4" /></Button>
                  </div>
                </motion.div>
              )}

              {step === 4 && adaptedCV && (
                <motion.div key="step4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                  <div className="text-center mb-6 sm:mb-8">
                    <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 mb-2">Exporta tu <span className="text-indigo-600 italic font-serif">CV</span></h2>
                    <p className="text-zinc-500 font-medium text-sm sm:text-base">Elige el template y descarga tu PDF profesional</p>
                  </div>
                  <ExportStep cv={adaptedCV} analysis={analysis} language={language} cvText={cvText} jdText={jdText} onBack={() => setStep(3)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {showCVManager && user && (
        <MasterCVManager userId={user.id} onSelect={(cv) => { setCvText(cv.content); setShowCVManager(false); }} onClose={() => setShowCVManager(false)} />
      )}
      {showPackages && <PackagesModal onClose={() => setShowPackages(false)} userId={user?.id} currentCredits={credits}
        onPurchased={(newCredits) => { setProfile((p: any) => ({ ...p, credits: newCredits })); }} />}
      {showAdmin && isAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
