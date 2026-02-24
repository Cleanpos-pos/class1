import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, X, Phone, Clock, MapPin, Truck, Leaf, Shirt, ArrowRight, Settings, Lock, Unlock, Sun, Moon, GripVertical, ShoppingBag, Plus, Loader2, RefreshCw, TrendingUp, TrendingDown, AlertCircle, Edit3, BedDouble, Sparkles, Check, Upload, ToggleLeft, ToggleRight, Users, Tag, Gift, Ticket, Search, Package, Calendar, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Minus, Repeat, Mail, UserPlus, Info, Send, FileText, Copy, Save, Download, User, LogIn, LogOut, FileCheck, Scissors, Droplet, Trash2, PackageCheck, CheckCircle, CheckCircle2, PieChart, Globe, ShieldCheck, Layers, Zap, BarChart3, CreditCard, Rocket, Facebook, Instagram, Pause, Play, ExternalLink, CalendarDays, DollarSign, Activity, Target, Award, Timer, Percent, ArrowUpRight, ArrowDownRight, Filter, Printer, LayoutDashboard, Receipt, Heart, Building2, MessageCircle, XCircle, Hash, Delete } from 'lucide-react';
import jsQR from 'jsqr';
import * as XLSX from 'xlsx';
import { Page, TimeSlot, CartItem, DeliveryOption, DiscountCode } from './types';
import { supabase } from './supabaseClient';
import { sendOrderConfirmation, sendBrevoEmail, sendCustomerSignupNotification } from './services/emailService';
import DeliveryMap from './components/DeliveryMap';
import { hashPassword, verifyPassword } from './utils/passwordUtils';

const formatPrice = (price: number | string) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${(num || 0).toFixed(2)}`;
};


/* 
  IMPORTANT: SQL UPDATE REQUIRED
  Run this in Supabase SQL Editor if you haven't already:

  ALTER TABLE cp_customers 
  ADD COLUMN IF NOT EXISTS starch_level text DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS finish_style text DEFAULT 'On Hanger',
  ADD COLUMN IF NOT EXISTS trouser_crease text DEFAULT 'Natural Crease',
  ADD COLUMN IF NOT EXISTS auth_repairs boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS detergent text DEFAULT 'Standard Scent',
  ADD COLUMN IF NOT EXISTS no_plastic boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recycle_hangers boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

  ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS preferences jsonb;
  ALTER TABLE cp_app_settings ADD CONSTRAINT cp_app_settings_key_key UNIQUE (key);
*/

// --- Types ---
interface Promotion {
  id: string;
  type: 'bogo' | 'bundle';
  name: string;
  active: boolean;
  buy_qty: number;
  get_qty: number;
  bundle_qty: number;
  bundle_price: number;
  included_items: string[];
}

interface ServiceCategory {
  name: string;
  sort_order: number;
  originalName?: string; // Used when editing
}

interface ServiceProduct {
  id: string;
  category: string;
  subcategory?: string;
  name: string;
  price?: number;
  price_numeric?: number;
  price_display?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: 'transactional' | 'marketing';
  variables: string[];
}

interface Invoice {
  id: string;
  customer_id: string;
  order_id: string;
  invoice_number: string;
  amount: number;
  items: any[];
  created_at: string;
}

// --- SEO & Schema ---
const SchemaMarkup: React.FC<{ tenant: any }> = ({ tenant }) => {
  if (!tenant) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "DryCleaningOrLaundry",
    "name": tenant.name,
    "url": `https://${tenant.subdomain}.cleanpos.app`,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": tenant.address,
      "addressLocality": tenant.town_city,
      "postalCode": tenant.postcode,
      "addressCountry": "GB"
    },
    "telephone": tenant.phone,
    "image": "https://cleanpos.app/logo.png"
  };
  return <script type="application/ld+json">{JSON.stringify(schema)}</script>;
};

const useSEO = (tenant: any, currentPage: string) => {
  useEffect(() => {
    if (!tenant) {
      document.title = "CleanPOS | The Operating System for Modern Dry Cleaners";
      return;
    }
    const baseTitle = tenant.seo_title || `${tenant.name} | Professional Dry Cleaners`;
    let pageTitle = baseTitle;
    if (currentPage === 'booking') pageTitle = `Book Online | ${tenant.name}`;
    if (currentPage === 'services') pageTitle = `Services & Pricing | ${tenant.name}`;
    if (currentPage === 'contact') pageTitle = `Contact Us | ${tenant.name}`;
    if (currentPage === 'back-office') pageTitle = `Back Office | ${tenant.name}`;
    document.title = pageTitle;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', tenant.seo_description || `Expert laundry and dry cleaning services by ${tenant.name}.`);

    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta');
      metaKeywords.setAttribute('name', 'keywords');
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute('content', tenant.seo_keywords || '');
  }, [tenant, currentPage]);
};

// --- Helper Functions ---

const getNextDate = (dayName: string) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  const targetDay = days.indexOf(dayName);
  if (targetDay === -1) return dayName;

  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + daysUntil);
  return nextDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};

// --- Report Helper Functions ---
const groupByDate = (data: any[], dateField = 'created_at') => {
  const grouped: Record<string, { date: string; total: number; count: number }> = {};
  data.forEach(item => {
    const date = new Date(item[dateField]).toISOString().split('T')[0];
    if (!grouped[date]) {
      grouped[date] = { date, total: 0, count: 0 };
    }
    grouped[date].total += parseFloat(item.total_amount) || 0;
    grouped[date].count += 1;
  });
  return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
};

const calculatePercentChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const formatCurrency = (amount: number): string => {
  return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCompactNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
};

const getDateRangePreset = (preset: 'today' | 'week' | 'month' | 'quarter' | 'year'): { start: string; end: string } => {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start: Date = new Date(now);

  switch (preset) {
    case 'today':
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'quarter':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { start: start.toISOString().split('T')[0], end };
};

// --- SVG Chart Components ---
const ReportBarChart: React.FC<{
  data: { label: string; value: number; color?: string }[];
  height?: number;
  showLabels?: boolean;
  barColor?: string;
}> = ({ data, height = 200, showLabels = true, barColor = '#0056b3' }) => {
  if (!data || data.length === 0) return <div className="text-gray-400 text-center py-8">No data available</div>;

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const barCount = data.length;
  const barWidth = Math.min(40, (100 / barCount) - 4);
  const gap = (100 - (barWidth * barCount)) / (barCount + 1);

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {data.map((item, i) => {
          const barHeight = (item.value / maxValue) * 38;
          const x = gap + i * (barWidth + gap);
          return (
            <g key={i}>
              <rect
                x={x}
                y={42 - barHeight}
                width={barWidth}
                height={barHeight}
                fill={item.color || barColor}
                rx={1}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              />
              {showLabels && (
                <text
                  x={x + barWidth / 2}
                  y={48}
                  textAnchor="middle"
                  className="fill-gray-500"
                  style={{ fontSize: '2.5px' }}
                >
                  {item.label.slice(0, 6)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const ReportLineChart: React.FC<{
  data: { label: string; value: number }[];
  height?: number;
  lineColor?: string;
  fillGradient?: boolean;
}> = ({ data, height = 200, lineColor = '#0056b3', fillGradient = true }) => {
  if (!data || data.length === 0) return <div className="text-gray-400 text-center py-8">No data available</div>;

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const range = maxValue - minValue || 1;

  const points = data.map((item, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 96 + 2;
    const y = 40 - ((item.value - minValue) / range) * 35;
    return { x, y, value: item.value, label: item.label };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1]?.x || 2} 42 L 2 42 Z`;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {fillGradient && (
          <path d={areaD} fill="url(#lineGradient)" />
        )}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.2"
            fill="white"
            stroke={lineColor}
            strokeWidth="0.5"
            className="hover:r-2 transition-all cursor-pointer"
          />
        ))}
      </svg>
    </div>
  );
};

const ReportDonutChart: React.FC<{
  data: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string | number;
}> = ({ data, size = 150, centerLabel, centerValue }) => {
  if (!data || data.length === 0) return <div className="text-gray-400 text-center py-8">No data</div>;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div className="text-gray-400 text-center py-8">No data</div>;

  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 100 100">
        {data.map((item, i) => {
          const strokeLength = (item.value / total) * circumference;
          const offset = currentOffset;
          currentOffset += strokeLength;

          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="12"
              strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
              className="transition-all duration-500 hover:opacity-80 cursor-pointer"
            />
          );
        })}
        {centerValue !== undefined && (
          <>
            <text x="50" y="46" textAnchor="middle" className="fill-gray-800 font-bold" style={{ fontSize: '12px' }}>
              {centerValue}
            </text>
            {centerLabel && (
              <text x="50" y="58" textAnchor="middle" className="fill-gray-500" style={{ fontSize: '6px' }}>
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ReportHeatmap: React.FC<{
  data: number[][];
  dayLabels?: string[];
  hourLabels?: number[];
}> = ({ data, dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hourLabels }) => {
  if (!data || data.length === 0) return <div className="text-gray-400 text-center py-8">No data available</div>;

  const maxValue = Math.max(...data.flat(), 1);
  const hours = hourLabels || Array.from({ length: 24 }, (_, i) => i);

  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return '#f3f4f6';
    if (intensity < 0.25) return '#dbeafe';
    if (intensity < 0.5) return '#93c5fd';
    if (intensity < 0.75) return '#3b82f6';
    return '#1d4ed8';
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex">
          <div className="w-12" />
          {hours.filter((_, i) => i % 3 === 0).map(h => (
            <div key={h} className="flex-1 text-[10px] text-gray-400 text-center font-medium">
              {h}:00
            </div>
          ))}
        </div>
        {dayLabels.map((day, dayIdx) => (
          <div key={day} className="flex items-center">
            <div className="w-12 text-xs font-semibold text-gray-600 pr-2">{day}</div>
            <div className="flex-1 flex gap-[2px]">
              {hours.map(hour => (
                <div
                  key={`${day}-${hour}`}
                  className="flex-1 h-6 rounded-sm cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                  style={{ backgroundColor: getColor(data[dayIdx]?.[hour] || 0) }}
                  title={`${day} ${hour}:00 - ${data[dayIdx]?.[hour] || 0} orders`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- KPI Card Component ---
const KPICard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan';
  subtitle?: string;
}> = ({ title, value, change, changeLabel, icon, color, subtitle }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-200'
  };

  const iconBgClasses = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    purple: 'bg-purple-100',
    orange: 'bg-orange-100',
    red: 'bg-red-100',
    cyan: 'bg-cyan-100'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {change !== undefined && (
            <p className={`text-sm font-semibold mt-2 flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(change).toFixed(1)}% {changeLabel || 'vs last period'}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${iconBgClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const generateInvoice = async (order: any, tenantId: string) => {
  const { data: settingsData } = await supabase.from('cp_app_settings').select('*').eq('tenant_id', tenantId);
  const settings: any = {};
  if (settingsData) {
    settingsData.forEach((item: any) => { settings[item.key] = item.value; });
  }

  const storeName = settings.store_name || 'Class 1 Dry Cleaners';
  const storeAddress = settings.store_address || '67 Stoney Ln, Weeke, Winchester SO22 6EW';
  const storeVat = settings.store_vat || '';
  const storePhone = settings.store_phone || '01962 861998';
  const storeEmail = settings.store_email || 'info@class1.co.uk';
  const footer = settings.invoice_footer || 'Thank you for your business!';

  const total = order.items ? order.items.reduce((acc: number, item: any) => acc + (parseFloat(item.price) * item.quantity), 0) : 0;
  const discount = order.discount_amount || 0;
  const finalTotal = total - discount;
  const pointsEarned = order.points_earned || 0;

  // Calculate VAT (20% standard UK rate) as included amount if VAT number is set
  const vatIncluded = storeVat ? (finalTotal / 1.20) * 0.20 : 0;

  let prefsHtml = '';
  if (order.preferences) {
    prefsHtml = `
        <div style="margin-bottom: 20px; padding: 10px; background-color: #f9f9f9; border-radius: 5px; font-size: 12px; color: #555;">
            <strong>Cleaning Preferences:</strong><br/>
            Shirts: ${order.preferences.starch} Starch, ${order.preferences.finish}<br/>
            Care: ${order.preferences.detergent}, ${order.preferences.trouser_crease}<br/>
            ${order.preferences.auth_repairs ? '✔ Authorized Minor Repairs (£5 max)<br/>' : ''}
            ${order.preferences.no_plastic ? '✔ No Plastic Covers<br/>' : ''}
            ${order.preferences.recycle_hangers ? '✔ Recycle Hangers<br/>' : ''}
        </div>
      `;
  }

  const invoiceHTML = `
    <html>
      <head>
        <title>Invoice #${order.readable_id}</title>
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
          .company-info h1 { margin: 0 0 10px 0; color: #0056b3; }
          .company-info p { margin: 2px 0; font-size: 14px; color: #666; }
          .invoice-details { text-align: right; }
          .invoice-details h2 { margin: 0 0 10px 0; color: #333; }
          .bill-to { margin-bottom: 30px; }
          .bill-to h3 { margin: 0 0 10px 0; font-size: 16px; color: #666; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { text-align: left; padding: 12px; border-bottom: 2px solid #eee; color: #666; font-size: 14px; text-transform: uppercase; }
          td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
          .total-section { display: flex; justify-content: flex-end; }
          .total-table { width: 300px; }
          .total-table td { border: none; padding: 5px 12px; }
          .total-table .final { font-weight: bold; font-size: 18px; border-top: 2px solid #333; padding-top: 10px; }
          .loyalty-banner { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; padding: 20px; border-radius: 10px; margin: 30px 0; text-align: center; }
          .loyalty-banner h3 { margin: 0 0 10px 0; font-size: 24px; }
          .loyalty-banner p { margin: 5px 0; font-size: 14px; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            <h1>${storeName}</h1>
            <p>${storeAddress.replace(/\n/g, '<br>')}</p>
            <p>Phone: ${storePhone}</p>
            <p>Email: ${storeEmail}</p>
            ${storeVat ? `<p>VAT: ${storeVat}</p>` : ''}
          </div>
          <div class="invoice-details">
            <h2>INVOICE</h2>
            <p><strong>Order #:</strong> ${order.readable_id}</p>
            <p><strong>Date:</strong> ${new Date(order.created_at || new Date()).toLocaleDateString()}</p>
            <p><strong>Status:</strong> ${(order.status || 'pending').toUpperCase()}</p>
          </div>
        </div>

        <div class="bill-to">
          <h3>Bill To:</h3>
          <p><strong>${order.customer_name}</strong></p>
          <p>${order.customer_address}</p>
          <p>${order.customer_email}</p>
          <p>${order.customer_phone}</p>
        </div>

        ${prefsHtml}

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item: any) => `
              <tr>
                <td>${item.name} ${item.note ? `<br><span style="font-size:11px; color:#888;">Note: ${item.note}</span>` : ''}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: right;">£${parseFloat(item.price).toFixed(2)}</td>
                <td style="text-align: right;">£${(parseFloat(item.price) * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <table class="total-table">
            <tr>
              <td>Subtotal</td>
              <td style="text-align: right;">£${total.toFixed(2)}</td>
            </tr>
            ${discount > 0 ? `
            <tr>
              <td style="color: green;">Discount Applied</td>
              <td style="text-align: right; color: green;">-£${discount.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
              <td class="final">Total</td>
              <td class="final" style="text-align: right;">£${finalTotal.toFixed(2)}</td>
            </tr>
            ${storeVat && vatIncluded > 0 ? `
            <tr>
              <td style="font-size: 12px; color: #888;">VAT (20% included)</td>
              <td style="text-align: right; font-size: 12px; color: #888;">£${vatIncluded.toFixed(2)}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${pointsEarned > 0 ? `
        <div class="loyalty-banner">
          <h3>🎁 You Earned ${pointsEarned} Loyalty Points!</h3>
          <p>Keep collecting points for amazing rewards</p>
          <p style="font-size: 12px; opacity: 0.9;">Your points are automatically added to your account</p>
        </div>
        ` : ''}

        <div class="footer">
          <p>${footer}</p>
        </div>
        
        <script>window.print();</script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
  }
};
// --- Components ---
const ThemeToggle: React.FC<{ darkMode: boolean; toggle: () => void; className?: string }> = ({ darkMode, toggle, className }) => (
  <button
    onClick={toggle}
    className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} ${className}`}
    title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
  >
    {darkMode ? <Sun size={20} /> : <Moon size={20} />}
  </button>
);

const Header: React.FC<{ tenant: any; currentPage: Page; setPage: (p: Page) => void; cartCount: number; onLoginClick: () => void; isLoggedIn: boolean; onLogout: () => void; darkMode: boolean; toggleDark: () => void; settings: any }> = ({ tenant, currentPage, setPage, cartCount, onLoginClick, isLoggedIn, onLogout, darkMode, toggleDark, settings }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems: { label: string; page: Page }[] = [{ label: 'Home', page: 'home' }, { label: 'Services & Pricing', page: 'services' }, { label: 'Contact', page: 'contact' }];

  // Custom Branding based on tenant
  const brandName = tenant?.name || 'CleanPOS';
  const brandShort = brandName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <header className="fixed w-full top-0 border-b border-gray-800 text-white backdrop-blur-sm z-40 transition-colors shadow-2xl" style={{ backgroundColor: settings?.header_color || '#030712' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center cursor-pointer group" onClick={() => setPage('home')}>
            <div className="bg-trust-blue text-white font-heading font-bold text-2xl px-3 py-1.5 rounded-xl mr-3 group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">{brandShort}</div>
            <span className="font-heading font-bold text-xl sm:text-2xl tracking-tight text-white group-hover:text-trust-blue transition-colors">
              {brandName.toUpperCase()}
            </span>
          </div>
          <nav className="hidden md:flex space-x-8 items-center">
            {navItems.map((item) => (
              <button
                key={item.page}
                onClick={() => setPage(item.page)}
                className={`text-sm font-bold transition-all hover:scale-105 ${currentPage === item.page ? 'text-trust-blue' : 'text-gray-300 hover:text-white'}`}
              >
                {item.label}
              </button>
            ))}
            {isLoggedIn ? (
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setPage('customer-portal' as Page)}
                  className={`text-sm font-bold flex items-center gap-1 transition-colors ${currentPage === 'customer-portal' as Page ? 'text-trust-blue' : 'text-gray-300 hover:text-white'}`}
                >
                  <User size={18} /> My Account
                </button>
                <button onClick={onLogout} className="text-sm font-bold text-red-500 hover:text-red-400">Logout</button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button onClick={onLoginClick} className="text-sm font-bold flex items-center gap-2 text-gray-300 hover:text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition">
                  <LogIn size={18} /> Log In
                </button>
                <button onClick={onLoginClick} className="text-sm font-bold bg-trust-blue text-white px-6 py-2.5 rounded-full hover:bg-trust-blue-hover transition-all shadow-lg hover:shadow-blue-500/30 transform hover:-translate-y-0.5">
                  Sign Up
                </button>
              </div>
            )}
            <ThemeToggle darkMode={darkMode} toggle={toggleDark} className="ml-2" />
            <button
              onClick={() => setPage('booking')}
              className="relative bg-white text-gray-900 hover:bg-gray-100 px-7 py-2.5 rounded-full font-bold transition-all shadow-xl flex items-center gap-2 transform hover:scale-105 active:scale-95 ml-2"
            >
              <span>Book Collection</span>
              {cartCount > 0 && (
                <span className="bg-trust-blue text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg absolute -top-2 -right-1 animate-pulse">
                  {cartCount}
                </span>
              )}
            </button>
          </nav>
          <div className="md:hidden flex items-center gap-3">
            <ThemeToggle darkMode={darkMode} toggle={toggleDark} />
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white p-2 hover:bg-gray-800 rounded-lg transition-colors">
              {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-gray-900/98 backdrop-blur-xl border-t border-gray-800 absolute w-full shadow-2xl animate-slide-down">
          <div className="px-6 pt-4 pb-12 space-y-4">
            {navItems.map((item) => (
              <button
                key={item.page}
                onClick={() => { setPage(item.page); setMobileMenuOpen(false); }}
                className={`block w-full text-left px-4 py-4 text-lg font-bold rounded-2xl transition-all ${currentPage === item.page ? 'bg-trust-blue/10 text-trust-blue' : 'text-gray-300 hover:bg-gray-800'}`}
              >
                {item.label}
              </button>
            ))}
            <div className="h-px bg-gray-800 my-4" />
            <button
              onClick={() => { if (isLoggedIn) { setPage('customer-portal' as Page); } else { onLoginClick(); } setMobileMenuOpen(false); }}
              className="block w-full text-left px-4 py-4 text-lg font-bold text-gray-300 hover:bg-gray-800 rounded-2xl flex items-center gap-3"
            >
              {isLoggedIn ? <><User size={20} /> My Account</> : <><LogIn size={20} /> Log In / Sign Up</>}
            </button>
            <button
              onClick={() => { setPage('booking'); setMobileMenuOpen(false); }}
              className="w-full mt-6 bg-trust-blue text-white px-6 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/20 active:scale-95 transition-transform"
            >
              Book Collection {cartCount > 0 && <span className="bg-white/20 text-white text-sm font-bold px-2 py-1 rounded-lg ml-2">{cartCount}</span>}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

const Footer: React.FC<{
  tenant: any;
  setPage: (p: Page) => void;
  onStaffLogin: (type: 'admin' | 'driver') => void;
  onMasterAuth?: () => void;
  settings: any
}> = ({ tenant, setPage, onStaffLogin, onMasterAuth, settings }) => {
  const brandName = tenant?.name || 'CleanPOS';

  // Helper to get best available address
  const getAddress = () => {
    if (settings?.store_address) return settings.store_address;
    if (tenant?.address) return `${tenant.address}\n${tenant.town_city || ''} ${tenant.postcode || ''}`;
    return 'Available at various partner locations nationwide.';
  };

  const getPhone = () => settings?.store_phone || tenant?.phone || 'Contact Local Support';
  const getEmail = () => settings?.store_email || tenant?.email || 'support@cleanpos.app';

  return (
    <footer className="text-white pt-24 pb-12 border-t border-gray-900" style={{ backgroundColor: settings?.footer_color || '#030712' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
          <div className="space-y-6">
            <div className="font-heading font-bold text-2xl tracking-tight text-white uppercase">{brandName}</div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Powered by CleanPOS - The ultimate operating system for modern dry cleaning businesses.
            </p>
            <div className="flex gap-4">
              <div onClick={() => setPage('home')} className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center hover:bg-trust-blue transition-colors cursor-pointer"><Globe size={18} /></div>
              {tenant?.social_facebook && (
                <a href={tenant.social_facebook} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors cursor-pointer"><Facebook size={18} /></a>
              )}
              {tenant?.social_instagram && (
                <a href={tenant.social_instagram} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center hover:bg-pink-600 transition-colors cursor-pointer"><Instagram size={18} /></a>
              )}
            </div>
          </div>
          <div>
            <h4 className="font-bold text-lg mb-6 text-white border-b border-trust-blue/30 pb-2 inline-block">Explore</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li><button onClick={() => setPage('home')} className="hover:text-trust-blue transition-all hover:pl-2">Home</button></li>
              <li><button onClick={() => setPage('services')} className="hover:text-trust-blue transition-all hover:pl-2">Services & Pricing</button></li>
              <li><button onClick={() => setPage('booking')} className="hover:text-trust-blue transition-all hover:pl-2">Book Collection</button></li>
              <li><button onClick={() => setPage('track-order')} className="hover:text-trust-blue transition-all hover:pl-2">Track Your Order</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-lg mb-6 text-white border-b border-trust-blue/30 pb-2 inline-block">Our Services</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="hover:text-white transition-colors cursor-default flex items-center gap-2"><Droplet size={14} className="text-trust-blue" /> Professional Dry Cleaning</li>
              <li className="hover:text-white transition-colors cursor-default flex items-center gap-2"><Droplet size={14} className="text-trust-blue" /> Wet Cleaning & Laundry</li>
              <li className="hover:text-white transition-colors cursor-default flex items-center gap-2"><Droplet size={14} className="text-trust-blue" /> Wedding Dress Preservation</li>
              <li className="hover:text-white transition-colors cursor-default flex items-center gap-2"><Droplet size={14} className="text-trust-blue" /> Alterations & Repair</li>
              <li className="hover:text-white transition-colors cursor-default flex items-center gap-2"><Droplet size={14} className="text-trust-blue" /> Bulk Laundry Services</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-lg mb-6 text-white border-b border-trust-blue/30 pb-2 inline-block">Visit Us</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <MapPin size={20} className="mt-1 text-trust-blue shrink-0" />
                <span className="whitespace-pre-line">{getAddress()}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={18} className="text-trust-blue" />
                <span>{getPhone()}</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="text-trust-blue" />
                <span>{getEmail()}</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-900 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} {brandName}. All rights reserved.
            <span className="ml-2 px-2 py-0.5 bg-gray-900 rounded text-[10px] border border-gray-800 uppercase tracking-widest">SaaS Powered</span>
          </p>
          <div className="flex gap-6 items-center">
            <button onClick={() => onStaffLogin('admin')} className="text-sm font-bold text-gray-500 hover:text-white transition flex items-center gap-2 bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-800">
              <Lock size={14} /> Admin Access
            </button>
            {onMasterAuth && (
              <button onClick={onMasterAuth} className="text-[10px] uppercase font-bold text-gray-800 hover:text-gray-700 transition">
                Master System
              </button>
            )}
            <button onClick={() => onStaffLogin('driver')} className="text-sm font-bold text-gray-500 hover:text-white transition flex items-center gap-2 bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-800">
              <Truck size={14} /> Driver Login
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};


// Staff Login Modal with Driver Authentication
const StaffLoginModal: React.FC<{ isOpen: boolean; type: 'admin' | 'driver' | null; onClose: () => void; onLogin: (userData: any, type: 'admin' | 'driver') => void; tenant: any }> = ({ isOpen, type, onClose, onLogin, tenant }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [signupData, setSignupData] = useState({ name: '', email: '', phone: '', vehicle_reg: '' });

  const [isForgot, setIsForgot] = useState(false);
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleForgotPassword = async () => {
    setError('');
    setSuccess('');
    if (!email) {
      setError('Please enter your email first.');
      return;
    }

    try {
      let currentTenantId = tenant?.id;
      if (!currentTenantId) {
        const subdomain = window.location.hostname.split('.')[0];
        const { data: tenantData } = await supabase.from('tenants').select('id').eq('subdomain', subdomain).maybeSingle();
        currentTenantId = tenantData?.id;
      }

      const table = type === 'admin' ? 'staff' : 'cp_drivers';
      const emailField = type === 'admin' ? 'login_id' : 'email';

      const { data, error: fetchError } = await supabase
        .from(table)
        .select('name')
        .eq(emailField, email.toLowerCase())
        .eq('tenant_id', currentTenantId)
        .single();

      if (fetchError || !data) {
        setError('Account not found with this email in this store.');
        return;
      }

      await sendBrevoEmail({
        toEmail: email,
        toName: data.name,
        subject: `Staff Password Reset - ${tenant?.name || 'CleanPOS'}`,
        textContent: `Hi ${data.name},\n\nWe received a password reset request for your ${type} account at ${tenant?.name || 'CleanPOS'}.\n\nPlease follow the instructions in the app to reset your password.\n\nTeam CleanPOS`
      });

      setSuccess('Reset instructions sent to your email.');
    } catch (err: any) {
      setError('Error: ' + err.message);
    }
  };

  const handleLogin = async () => {
    setError('');

    try {
      let currentTenantId = tenant?.id;

      if (!currentTenantId) {
        const subdomain = window.location.hostname.split('.')[0];
        const { data: tenantData } = await supabase.from('tenants').select('id').eq('subdomain', subdomain).maybeSingle();
        currentTenantId = tenantData?.id;
      }

      if (!currentTenantId && type !== 'admin') {
        setError('Could not identify store. Please access via your store URL.');
        return;
      }

      if (type === 'admin') {
        if (!email || !password) {
          setError('Please enter email and password');
          return;
        }

        const { data, error: dbError } = await supabase
          .from('staff')
          .select('*')
          .eq('login_id', email.toLowerCase())
          .eq('tenant_id', currentTenantId)
          .eq('is_active', true)
          .maybeSingle();

        if (dbError || !data) {
          setError('Account not found or inactive');
          return;
        }

        const isValidPassword = await verifyPassword(password, data.hashed_password);
        if (!isValidPassword) {
          setError('Invalid password');
          return;
        }

        onLogin(data, 'admin');
      } else if (type === 'driver') {
        if (!email || !password) {
          setError('Please enter email and password');
          return;
        }

        const { data, error: dbError } = await supabase
          .from('cp_drivers')
          .select('*')
          .eq('email', email.toLowerCase())
          .eq('tenant_id', currentTenantId)
          .eq('active', true)
          .maybeSingle();

        if (dbError || !data) {
          setError('Driver not found or inactive');
          return;
        }

        const isValidPassword = await verifyPassword(password, data.password_hash);
        if (!isValidPassword) {
          setError('Invalid password');
          return;
        }

        onLogin(data, 'driver');
      }
    } catch (err: any) {
      setError('Connection error: ' + err.message);
    }
  };

  const handleSignup = async () => {
    setError('');

    if (!signupData.name || !signupData.email || !password) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      let currentTenantId = tenant?.id;

      if (!currentTenantId) {
        const subdomain = window.location.hostname.split('.')[0];
        const { data: tenantData } = await supabase.from('tenants').select('id').eq('subdomain', subdomain).maybeSingle();
        currentTenantId = tenantData?.id;
      }

      if (!currentTenantId) {
        setError('Could not identify store. Please access via your store URL.');
        return;
      }

      // Check if driver already exists
      const { data: existing } = await supabase
        .from('cp_drivers')
        .select('id')
        .eq('email', signupData.email.toLowerCase())
        .single();

      if (existing) {
        setError('Driver with this email already exists');
        return;
      }

      // Create new driver with hashed password
      const hashedPassword = await hashPassword(password);
      const { data, error: insertError } = await supabase
        .from('cp_drivers')
        .insert([{
          name: signupData.name,
          email: signupData.email.toLowerCase(),
          phone: signupData.phone,
          vehicle_reg: signupData.vehicle_reg,
          password_hash: hashedPassword,
          active: true,
          working_days: [],
          tenant_id: currentTenantId
        }])
        .select()
        .single();

      if (insertError) {
        setError('Error creating driver account: ' + insertError.message);
        return;
      }

      if (data) {
        alert('Driver account created successfully! Please log in.');
        setIsSignup(false);
        setSignupData({ name: '', email: '', phone: '', vehicle_reg: '' });
        setPassword('');
      }
    } catch (err: any) {
      setError('Signup error: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-trust-blue" />
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isForgot ? 'Reset Password' : (type === 'admin' ? 'Admin Login' : (isSignup ? 'Driver Signup' : 'Driver Login'))}
              </h2>
              {tenant && (
                <p className="text-xs font-bold text-trust-blue uppercase tracking-wider mb-1">
                  Store: {tenant.name}
                </p>
              )}
              <p className="text-sm text-gray-500">
                {isForgot ? 'We will send a reset link to your email' : (type === 'admin' ? 'Access your store back office' : 'Partner delivery portal')}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-4">
            {isForgot ? (
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Work Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl p-3 outline-none transition-all"
                    placeholder="Enter your email"
                  />
                </div>
                {error && <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg">{error}</div>}
                {success && <div className="text-green-600 text-xs font-bold bg-green-50 p-3 rounded-lg">{success}</div>}
                <button
                  onClick={handleForgotPassword}
                  className="w-full bg-trust-blue text-white py-4 rounded-xl font-bold hover:bg-trust-blue-hover shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                >
                  Send Reset Instructions
                </button>
                <button
                  onClick={() => { setIsForgot(false); setError(''); setSuccess(''); }}
                  className="w-full text-trust-blue font-bold text-sm hover:underline"
                >
                  Back to Login
                </button>
              </>
            ) : type === 'admin' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Admin Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl p-3 outline-none transition-all"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="block text-sm font-bold text-gray-700">Password</label>
                    <button onClick={() => setIsForgot(true)} className="text-xs font-bold text-trust-blue hover:underline">Forgot?</button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl p-3 outline-none transition-all"
                    placeholder="••••••••"
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                {error && <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg">{error}</div>}
                <button
                  onClick={handleLogin}
                  className="w-full bg-trust-blue text-white py-4 rounded-xl font-bold hover:bg-trust-blue-hover shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                >
                  Sign In to Dashboard
                </button>
              </div>
            ) : isSignup ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Full Name *</label>
                    <input type="text" value={signupData.name} onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} className="w-full border rounded-lg p-2.5 text-sm" placeholder="John Smith" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Email *</label>
                    <input type="email" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} className="w-full border rounded-lg p-2.5 text-sm" placeholder="driver@test.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Password *</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm" placeholder="Create password" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Phone</label>
                    <input type="tel" value={signupData.phone} onChange={(e) => setSignupData({ ...signupData, phone: e.target.value })} className="w-full border rounded-lg p-2.5 text-sm" placeholder="07123..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Vehicle Reg</label>
                    <input type="text" value={signupData.vehicle_reg} onChange={(e) => setSignupData({ ...signupData, vehicle_reg: e.target.value.toUpperCase() })} className="w-full border rounded-lg p-2.5 text-sm uppercase" placeholder="AB12 CDE" />
                  </div>
                </div>
                {error && <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg">{error}</div>}
                <button onClick={handleSignup} className="w-full bg-trust-blue text-white py-3.5 rounded-xl font-bold hover:bg-trust-blue-hover shadow-lg transition-all active:scale-95">Register as Driver</button>
                <button onClick={() => { setIsSignup(false); setError(''); }} className="w-full text-trust-blue font-bold text-sm hover:underline">Already have an account? Login</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Driver Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl p-3 outline-none transition-all"
                    placeholder="driver@example.com"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="block text-sm font-bold text-gray-700">Password</label>
                    <button onClick={() => setIsForgot(true)} className="text-xs font-bold text-trust-blue hover:underline">Forgot?</button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl p-3 outline-none transition-all"
                    placeholder="••••••••"
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                {error && <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg">{error}</div>}
                <button onClick={handleLogin} className="w-full bg-trust-blue text-white py-4 rounded-xl font-bold hover:bg-trust-blue-hover shadow-lg shadow-blue-500/20 transition-all active:scale-95">Log In to Portal</button>
                <button onClick={() => { setIsSignup(true); setError(''); }} className="w-full text-trust-blue font-bold text-sm hover:underline">New driver? Create account</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


const CustomerLoginModal: React.FC<{ isOpen: boolean; onClose: () => void; onLogin: (user: any) => void; tenantId: string; storeEmail: string; storeName?: string }> = ({ isOpen, onClose, onLogin, tenantId, storeEmail, storeName }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (isForgot) {
      if (!email) { setError('Please enter your email.'); setLoading(false); return; }
      // Simulate/Send reset email
      const { data } = await supabase.from('cp_customers').select('name').eq('email', email).eq('tenant_id', tenantId).single();
      if (data) {
        await sendBrevoEmail({
          toEmail: email,
          toName: data.name,
          subject: `Reset Password Request - ${storeName || 'CleanPOS'}`,
          textContent: `Hi ${data.name},\n\nWe received a password reset request for your account. Please follow the instructions in the app to reset your password.\n\nTeam ${storeName || 'CleanPOS'}`
        });
        setSuccess('Password reset instructions sent to your email.');
      } else {
        setError('Account not found with this email.');
      }
      setLoading(false);
      return;
    }

    if (isSignUp) {
      if (!name || !phone || !email || !password) { setError('All fields are required.'); setLoading(false); return; }
      const { data: existingUser } = await supabase.from('cp_customers').select('id').eq('email', email).eq('tenant_id', tenantId).single();
      if (existingUser) { setError('Email already registered.'); setLoading(false); return; }
      const { data, error: insertError } = await supabase.from('cp_customers').insert([{ name, email, phone, password, loyalty_points: 0, tenant_id: tenantId }]).select().single();
      if (insertError || !data) {
        setError('Failed to create account.');
      } else {
        sendCustomerSignupNotification({ customerName: name, customerEmail: email, customerPhone: phone, storeEmail, storeName });
        onLogin(data);
        onClose();
      }
    } else {
      const { data, error } = await supabase.from('cp_customers').select('*').eq('email', email).eq('tenant_id', tenantId).single();
      if (error || !data) {
        // Check if this is an admin account to guide them
        const { data: staff } = await supabase.from('staff').select('id').eq('login_id', email.toLowerCase()).eq('tenant_id', tenantId).maybeSingle();
        if (staff) {
          setError('This email is registered as an Administrator. Please log in via the Back Office link.');
        } else {
          setError('Account not found.');
        }
      } else if (data.password !== password) {
        setError('Incorrect password.');
      } else {
        onLogin(data);
        onClose();
      }
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-trust-blue" />
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {isForgot ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Welcome Back')}
          </h2>
          <p className="text-gray-500 text-sm">
            {isForgot ? 'Enter your email to receive a reset link' : (isSignUp ? 'Join us to track orders & earn rewards' : 'Log in to manage your orders')}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Full Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl px-4 py-2.5 outline-none transition-all" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Phone Number</label>
                <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl px-4 py-2.5 outline-none transition-all" placeholder="07123 456789" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Email Address</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl px-4 py-2.5 outline-none transition-all" placeholder="you@example.com" />
          </div>
          {!isForgot && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Password</label>
                {!isSignUp && (
                  <button type="button" onClick={() => setIsForgot(true)} className="text-[10px] font-bold text-trust-blue hover:underline uppercase">Forgot?</button>
                )}
              </div>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border-2 border-gray-100 focus:border-trust-blue rounded-xl px-4 py-2.5 outline-none transition-all" placeholder="••••••••" />
            </div>
          )}

          {error && <p className="text-red-500 text-xs text-center font-bold bg-red-50 py-2 rounded-lg">{error}</p>}
          {success && <p className="text-green-600 text-xs text-center font-bold bg-green-50 py-2 rounded-lg">{success}</p>}

          <button type="submit" disabled={loading} className="w-full bg-trust-blue text-white font-bold py-3.5 rounded-xl hover:bg-trust-blue-hover disabled:opacity-50 shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isForgot ? 'Send Instructions' : (isSignUp ? 'Create Account' : 'Log In'))}
          </button>
        </form>

        <div className="mt-6 text-center text-sm border-t border-gray-100 pt-4">
          {isForgot ? (
            <button onClick={() => setIsForgot(false)} className="text-trust-blue font-bold hover:underline">Back to Login</button>
          ) : (
            <button onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); }} className="text-trust-blue font-bold hover:underline">
              {isSignUp ? 'Already have an account? Log In' : 'New here? Create an Account'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


const CustomerPortalPage: React.FC<{ user: any; onUpdateUser: (u: any) => void; tenantId: string; setPage?: (page: Page) => void; onLogout?: () => void }> = ({ user, onUpdateUser, tenantId, setPage, onLogout }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    name: user.name || '',
    phone: user.phone || '',
    address: user.address || '',
    notes: user.notes || '',
    starch: user.starch_level || 'None',
    finish: user.finish_style || 'On Hanger',
    crease: user.trouser_crease || 'Natural Crease',
    repairs: user.auth_repairs || false,
    detergent: user.detergent || 'Standard Scent',
    noPlastic: user.no_plastic || false,
    recycleHangers: user.recycle_hangers || false
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      // Fetch orders with their items
      const { data: orderData, error: orderError } = await supabase
        .from('cp_orders')
        .select('*, items:cp_order_items(*)')
        .eq('customer_email', user.email)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (orderError) {
        console.error('Error fetching order history:', orderError);
      } else if (orderData) {
        setOrders(orderData);
      }

      // Also fetch invoices
      const { data: invoiceData } = await supabase.from('cp_invoices')
        .select('*')
        .eq('customer_id', user.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (invoiceData) {
        setInvoices(invoiceData);
      }

      setLoading(false);
    };
    fetchHistory();
  }, [user.email, user.id, tenantId]);

  // Real-time subscription for order updates
  useEffect(() => {
    const ordersSubscription = supabase
      .channel('customer-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cp_orders',
          filter: `customer_email=eq.${user.email}` // Note: Realtime filter string limitations might prevent AND tenant_id. 
          // However, we re-fetch below with tenant_id filter so it's safe.
        },
        (payload) => {
          // Refresh orders when any change occurs
          const refreshOrders = async () => {
            const { data: orderData } = await supabase
              .from('cp_orders')
              .select('*, items:cp_order_items(*)')
              .eq('customer_email', user.email)
              .eq('tenant_id', tenantId)
              .order('created_at', { ascending: false });
            if (orderData) setOrders(orderData);
          };
          refreshOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersSubscription);
    };
  }, [user.email]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const { data: orderData } = await supabase
      .from('cp_orders')
      .select('*, items:cp_order_items(*)')
      .eq('customer_email', user.email)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (orderData) setOrders(orderData);
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from('cp_customers').update({
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
      notes: profile.notes,
      starch_level: profile.starch,
      finish_style: profile.finish,
      trouser_crease: profile.crease,
      auth_repairs: profile.repairs,
      detergent: profile.detergent,
      no_plastic: profile.noPlastic,
      recycle_hangers: profile.recycleHangers
    }).eq('email', user.email);

    if (!error) {
      setMsg('Saved Successfully!');
      onUpdateUser({
        ...user, ...profile,
        starch_level: profile.starch,
        finish_style: profile.finish,
        trouser_crease: profile.crease,
        auth_repairs: profile.repairs,
        detergent: profile.detergent,
        no_plastic: profile.noPlastic,
        recycle_hangers: profile.recycleHangers
      });
      setTimeout(() => setMsg(''), 3000);
    } else {
      setMsg('Save failed. Run SQL update script.');
      console.error(error);
    }
    setSaving(false);
  };

  const isSuccess = new URLSearchParams(window.location.search).get('payment') === 'success';

  return (
    <div className="pt-28 pb-20 max-w-6xl mx-auto px-4 animate-fade-in">
      {isSuccess && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl flex items-center gap-3 animate-bounce-in">
          <div className="bg-green-100 p-2 rounded-full"><CheckCircle2 size={24} className="text-green-600" /></div>
          <div>
            <p className="font-bold">Payment Successful!</p>
            <p className="text-sm">Your order has been confirmed and payment processed. Thank you!</p>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-8">
        <div><h1 className="font-heading font-bold text-3xl text-gray-900">My Account</h1><p className="text-gray-600">Welcome back, {user.name}</p></div>
        <div className="bg-blue-50 px-4 py-2 rounded-lg text-center"><span className="block text-xs text-blue-600 font-bold uppercase">Loyalty Points</span><span className="text-2xl font-bold text-trust-blue">{user.loyalty_points || 0}</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">

          {/* Subscription Status Card */}
          {user.subscription_frequency && user.subscription_frequency !== 'none' && (
            <div className={`p-6 rounded-xl shadow-sm border mb-6 ${user.subscription_paused ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className={`font-bold text-lg flex items-center gap-2 ${user.subscription_paused ? 'text-yellow-800' : 'text-green-800'}`}>
                    <Repeat size={20} /> Subscription Active
                  </h3>
                  <p className={`text-sm ${user.subscription_paused ? 'text-yellow-700' : 'text-green-700'}`}>
                    {user.subscription_frequency} Valet Service
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${user.subscription_paused ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>
                  {user.subscription_paused ? 'Paused' : 'Active'}
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  {user.subscription_paused
                    ? "Your recurring service is currently paused. Resume anytime to restart collections."
                    : "Your service is active. We'll collect your valet bag automatically."}
                </p>

                <button
                  onClick={async () => {
                    const newStatus = !user.subscription_paused;
                    const { error } = await supabase.from('cp_customers').update({ subscription_paused: newStatus }).eq('id', user.id);
                    if (!error) {
                      onUpdateUser({ ...user, subscription_paused: newStatus });
                    } else {
                      alert('Failed to update subscription status');
                    }
                  }}
                  className={`w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition ${user.subscription_paused
                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-md'
                    : 'bg-white text-yellow-700 border border-yellow-300 hover:bg-yellow-50'
                    }`}
                >
                  {user.subscription_paused ? <><Play size={16} /> Resume Service</> : <><Pause size={16} /> Pause Service</>}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><User size={20} className="text-trust-blue" /> Contact Details</h3>
            <div className="space-y-4">
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label><input type="text" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Phone</label><input type="text" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Default Address</label><textarea rows={3} value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} className="w-full border rounded p-2 text-sm" /></div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Delivery Notes</label><textarea rows={2} value={profile.notes} onChange={e => setProfile({ ...profile, notes: e.target.value })} className="w-full border rounded p-2 text-sm" placeholder="e.g. Gate code 1234" /></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Settings size={20} className="text-trust-blue" /> Cleaning Preferences</h3>
            <div className="space-y-6">
              <div><h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><Shirt size={14} /> Shirt Essentials</h4><div className="space-y-3"><div><label className="block text-xs text-gray-600 mb-1">Starch Level</label><select value={profile.starch} onChange={e => setProfile({ ...profile, starch: e.target.value })} className="w-full border rounded p-2 text-sm bg-gray-50"><option value="None">None</option><option value="Light">Light</option><option value="Medium">Medium</option><option value="Heavy">Heavy</option></select></div><div><label className="block text-xs text-gray-600 mb-1">Finish Style</label><div className="flex gap-2">{['On Hanger', 'Folded'].map(opt => (<button key={opt} onClick={() => setProfile({ ...profile, finish: opt })} className={`flex-1 py-1.5 text-xs rounded border ${profile.finish === opt ? 'bg-trust-blue text-white border-trust-blue' : 'bg-white text-gray-600 border-gray-300'}`}>{opt}</button>))}</div></div></div></div>
              <div className="pt-4 border-t border-gray-100"><h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><Scissors size={14} /> General Care</h4><div className="space-y-3"><div><label className="block text-xs text-gray-600 mb-1">Trouser Creases</label><select value={profile.crease} onChange={e => setProfile({ ...profile, crease: e.target.value })} className="w-full border rounded p-2 text-sm bg-gray-50"><option value="Natural Crease">Natural Crease</option><option value="Sharp Crease">Sharp Crease</option><option value="No Crease">No Crease (Flat Press)</option></select></div><label className="flex items-center gap-2 cursor-pointer"><div className={`w-10 h-5 rounded-full p-1 transition-colors ${profile.repairs ? 'bg-green-500' : 'bg-gray-300'}`} onClick={() => setProfile({ ...profile, repairs: !profile.repairs })}><div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${profile.repairs ? 'translate-x-5' : 'translate-x-0'}`} /></div><span className="text-xs text-gray-700">Authorize Repairs (up to £5)</span></label></div></div>
              <div className="pt-4 border-t border-gray-100"><h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1"><Leaf size={14} /> Eco & Health</h4><div className="space-y-3"><div><label className="block text-xs text-gray-600 mb-1">Detergent Preference</label><select value={profile.detergent} onChange={e => setProfile({ ...profile, detergent: e.target.value })} className="w-full border rounded p-2 text-sm bg-gray-50"><option value="Standard Scent">Standard Scent</option><option value="Hypoallergenic">Hypoallergenic (Unscented)</option><option value="Organic">Organic / Green Solvent</option></select></div><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={profile.noPlastic} onChange={e => setProfile({ ...profile, noPlastic: e.target.checked })} className="rounded text-trust-blue focus:ring-trust-blue" /><span className="text-xs text-gray-700">No Plastic Covers</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={profile.recycleHangers} onChange={e => setProfile({ ...profile, recycleHangers: e.target.checked })} className="rounded text-trust-blue focus:ring-trust-blue" /><span className="text-xs text-gray-700">Recycle Hangers (Driver will collect)</span></label></div></div>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-200">{msg && <p className={`text-xs font-bold mb-2 text-center ${msg.includes('fail') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}<button onClick={handleSaveProfile} disabled={saving} className="w-full bg-trust-blue text-white py-3 rounded-lg text-sm font-bold hover:bg-trust-blue-hover transition flex justify-center items-center gap-2">{saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save All Preferences</>}</button></div>
          </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-fit">
          <div className="p-4 border-b border-gray-200 bg-gray-50 font-bold text-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} /> Order History
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 text-sm font-medium text-trust-blue hover:text-trust-blue-hover disabled:opacity-50 transition"
              title="Refresh orders"
            >
              <Repeat size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-trust-blue" /></div> : orders.length === 0 ? <div className="p-8 text-center text-gray-500">You haven't placed any orders yet.</div> : (
            <div className="divide-y divide-gray-100 max-h-[800px] overflow-y-auto">
              {orders.map(order => {
                const invoice = invoices.find(inv => inv.order_id === order.id);
                const isExpanded = expandedOrder === order.id;

                // Status info helper
                const getStatusInfo = (status: string) => {
                  const statusMap: { [key: string]: { label: string; color: string; icon: any; description: string } } = {
                    pending: { label: 'Order Received', color: 'yellow', icon: Package, description: 'Your order has been received and is being processed' },
                    dispatched: { label: 'Driver Dispatched', color: 'blue', icon: Truck, description: 'A driver has been dispatched to collect your items' },
                    collecting: { label: 'Collecting Items', color: 'blue', icon: Package, description: 'Driver is collecting your items' },
                    collection_failed: { label: 'Collection Failed', color: 'red', icon: XCircle, description: 'Collection was unsuccessful - customer or order not ready' },
                    collected: { label: 'Items Collected', color: 'indigo', icon: Check, description: 'Your items have been collected successfully' },
                    cleaning: { label: 'In Cleaning', color: 'purple', icon: Shirt, description: 'Your items are being cleaned and processed' },
                    ready_for_delivery: { label: 'Ready for Delivery', color: 'orange', icon: PackageCheck, description: 'Your items are cleaned and ready for delivery' },
                    out_for_delivery: { label: 'Out for Delivery', color: 'cyan', icon: Truck, description: 'Your items are on the way to you' },
                    delivered: { label: 'Delivered', color: 'teal', icon: CheckCircle, description: 'Your items have been delivered' },
                    completed: { label: 'Completed', color: 'green', icon: CheckCircle2, description: 'Order completed successfully' },
                  };
                  return statusMap[status] || { label: status, color: 'gray', icon: Package, description: '' };
                };

                const getProgressPercentage = (status: string) => {
                  if (status === 'collection_failed') return 33; // Collection phase percentage
                  const stages = ['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'];
                  const currentIndex = stages.indexOf(status);
                  return ((currentIndex + 1) / stages.length) * 100;
                };

                const statusInfo = getStatusInfo(order.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <div key={order.id} className="hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                    <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-bold text-lg text-gray-900">#{order.readable_id}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>
                            {order.status.replace(/_/g, ' ')}
                          </span>
                          {order.payment_status === 'paid' && (
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 border border-green-200">
                              <CheckCircle2 size={10} /> Paid
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString()} • {order.items?.length || 0} items</p>

                        {/* Progress Bar (Compact) */}
                        {order.status !== 'completed' && (
                          <div className="mt-3 max-w-xs">
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-trust-blue to-eco-green h-full rounded-full transition-all duration-500"
                                style={{ width: `${getProgressPercentage(order.status)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          className="flex items-center gap-2 text-sm font-bold text-trust-blue hover:text-trust-blue-hover bg-blue-50 px-4 py-2 rounded-lg transition"
                        >
                          <Search size={16} />
                          {isExpanded ? 'Hide Details' : 'Track Order'}
                        </button>
                        {order.status === 'completed' ? (
                          <button
                            onClick={() => generateInvoice(invoice ? { ...order, ...invoice } : order, user?.tenant_id || order.tenant_id)}
                            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded px-4 py-2 hover:bg-gray-50 transition"
                          >
                            <Download size={16} /> Invoice
                          </button>
                        ) : (
                          <span className="flex items-center gap-2 text-sm text-gray-400 border border-gray-200 rounded px-4 py-2 cursor-not-allowed">
                            <FileText size={16} /> Invoice (Available when complete)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Tracking Timeline */}
                    {isExpanded && (
                      <div className="px-6 pb-6 bg-gray-50/50 animate-fade-in border-t border-gray-100">
                        <div className="pt-6 space-y-6">
                          {/* Collection Failed Alert */}
                          {order.status === 'collection_failed' && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                              <div className="flex items-start gap-3">
                                <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                  <h4 className="font-bold text-red-800 mb-1">Collection Unsuccessful</h4>
                                  <p className="text-sm text-red-700 mb-1">Our driver was unable to complete the collection.</p>
                                  {order.collection_failed_reason && (
                                    <p className="text-xs text-red-600"><span className="font-bold">Reason:</span> {order.collection_failed_reason}</p>
                                  )}
                                  <p className="text-xs text-red-600 mt-1">Our team will contact you to reschedule.</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Timeline Card */}
                          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                            <h4 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                              <Truck size={18} className="text-trust-blue" />
                              Live Tracking Status
                            </h4>
                            <div className="space-y-4">
                              {['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].map((stage, index) => {
                                const stageInfo = getStatusInfo(stage);
                                const StageIcon = stageInfo.icon;
                                const stages = ['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'];
                                const isCompleted = stages.indexOf(order.status) >= index;
                                const isCurrent = order.status === stage;

                                return (
                                  <div key={stage} className="flex items-start gap-4">
                                    <div className="flex flex-col items-center">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isCurrent ? `bg-${stageInfo.color}-500 ring-4 ring-${stageInfo.color}-100` :
                                        isCompleted ? `bg-${stageInfo.color}-500` :
                                          'bg-gray-200'
                                        }`}>
                                        <StageIcon size={16} className={isCompleted ? 'text-white' : 'text-gray-400'} />
                                      </div>
                                      {index < 8 && (
                                        <div className={`w-0.5 h-6 ${isCompleted ? `bg-${stageInfo.color}-500` : 'bg-gray-200'}`} />
                                      )}
                                    </div>
                                    <div className="flex-1 pb-4">
                                      <h5 className={`text-sm font-bold ${isCurrent ? `text-${stageInfo.color}-600` :
                                        isCompleted ? 'text-gray-900' :
                                          'text-gray-400'
                                        }`}>
                                        {stageInfo.label}
                                      </h5>
                                      <p className="text-xs text-gray-500">{stageInfo.description}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Info Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
                              <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <MapPin size={16} className="text-trust-blue" />
                                Delivery Info
                              </h4>
                              <p className="text-sm text-gray-700">{order.customer_address}</p>
                              {order.delivery_slot && (
                                <p className="text-sm font-bold text-trust-blue mt-2">Slot: {order.delivery_slot}</p>
                              )}
                            </div>

                            {(order.pod_photo_url || order.collection_photo_url) && (
                              <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
                                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                                  <Search size={16} className="text-trust-blue" />
                                  Order Photos
                                </h4>
                                <div className="flex gap-3">
                                  {order.collection_photo_url && (
                                    <div className="relative group cursor-pointer" onClick={() => window.open(order.collection_photo_url, '_blank')}>
                                      <img src={order.collection_photo_url} className="w-20 h-20 object-cover rounded-lg border" />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                                        <Search size={20} className="text-white" />
                                      </div>
                                    </div>
                                  )}
                                  {order.pod_photo_url && (
                                    <div className="relative group cursor-pointer" onClick={() => window.open(order.pod_photo_url, '_blank')}>
                                      <img src={order.pod_photo_url} className="w-20 h-20 object-cover rounded-lg border" />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                                        <Search size={20} className="text-white" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2 italic">Click to view full size captures</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BackOfficePage: React.FC<{
  tenant: any;
  availableSlots: TimeSlot[];
  setAvailableSlots: React.Dispatch<React.SetStateAction<TimeSlot[]>>;
  deliveryOptions: DeliveryOption[];
  setDeliveryOptions: React.Dispatch<React.SetStateAction<DeliveryOption[]>>;
  onLogout: () => void;
  darkMode: boolean;
  toggleDark: () => void;
  onTenantUpdate?: (tenant: any) => void;
  companySettings: any;
}> = ({ tenant, availableSlots, setAvailableSlots, deliveryOptions, setDeliveryOptions, onLogout, darkMode, toggleDark, onTenantUpdate, companySettings }) => {
  const [activeTab, setActiveTab] = useState<'reports' | 'store' | 'service' | 'orders' | 'customers' | 'corporate' | 'subscriptions' | 'offers' | 'schedule' | 'marketing' | 'drivers' | 'billing' | 'invoices'>('orders');
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [saved, setSaved] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverForm, setDriverForm] = useState({ name: '', email: '', phone: '', vehicle_reg: '', password_hash: '', working_days: [] as string[] });
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isEditOrderOpen, setIsEditOrderOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [repairCharge, setRepairCharge] = useState(0);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  // Print Tags & QR Scanner
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedOrder, setScannedOrder] = useState<any>(null);
  const [showScannedOrderModal, setShowScannedOrderModal] = useState(false);
  const [showPrintTagModal, setShowPrintTagModal] = useState(false);
  const [printTagOrder, setPrintTagOrder] = useState<any>(null);
  const [printTagCount, setPrintTagCount] = useState(1);
  const [printToast, setPrintToast] = useState<{ show: boolean; type: 'success' | 'error' | 'warning'; message: string }>({ show: false, type: 'success', message: '' });
  const [showTouchKeypad, setShowTouchKeypad] = useState(false);
  const [touchKeypadValue, setTouchKeypadValue] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Show fancy print notification pop-up
  const showPrintToast = (type: 'success' | 'error' | 'warning', message: string) => {
    setPrintToast({ show: true, type, message });
    // Auto-dismiss success messages after 3 seconds, errors/warnings require manual dismiss
    if (type === 'success') {
      setTimeout(() => setPrintToast(prev => ({ ...prev, show: false })), 3000);
    }
  };

  // Collection Failed Modal
  const [showCollectionFailedModal, setShowCollectionFailedModal] = useState(false);
  const [collectionFailedReason, setCollectionFailedReason] = useState('');
  const [collectionFailedOrderId, setCollectionFailedOrderId] = useState<string | null>(null);

  // Generic Fancy Confirm Modal
  const [fancyConfirm, setFancyConfirm] = useState<{
    show: boolean;
    title: string;
    message: string;
    icon?: 'warning' | 'info' | 'success' | 'danger';
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  // Generic Fancy Alert Modal
  const [fancyAlert, setFancyAlert] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({ show: false, title: '', message: '', type: 'info' });

  const showFancyConfirm = (options: {
    title: string;
    message: string;
    icon?: 'warning' | 'info' | 'success' | 'danger';
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }) => {
    setFancyConfirm({ show: true, ...options });
  };

  const showFancyAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setFancyAlert({ show: true, type, title, message });
  };

  // Surcharge Modal for Edit Order
  const [showSurchargeModal, setShowSurchargeModal] = useState(false);
  const [surchargeDescription, setSurchargeDescription] = useState('');
  const [surchargeAmount, setSurchargeAmount] = useState('');

  const addSurcharge = () => {
    const amount = parseFloat(surchargeAmount);
    if (!surchargeDescription.trim() || isNaN(amount) || amount <= 0) {
      showFancyAlert('warning', 'Invalid Input', 'Please enter a description and valid amount.');
      return;
    }
    setOrderItems([...orderItems, {
      id: `surcharge_${Date.now()}`,
      item_name: surchargeDescription.trim(),
      name: surchargeDescription.trim(),
      quantity: 1,
      unit_price: amount,
      price: amount
    }]);
    setShowSurchargeModal(false);
    setSurchargeDescription('');
    setSurchargeAmount('');
  };

  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);
    try {
      // In a real implementation, this calls a Supabase Edge Function
      // For now, we'll simulate the flow or provide a placeholder
      const { data, error } = await supabase.functions.invoke('stripe-connect', {
        body: { action: 'setup', tenantId: tenant.id }
      });

      if (error) {
        console.error('Edge Function error:', error);
        alert('Stripe Connect error: ' + (error.message || 'Unknown error'));
      } else if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      alert('Error connecting Stripe: ' + err.message);
    } finally {
      setIsConnectingStripe(false);
    }
  };

  // Print Order Tag function (Electron desktop app)
  const printOrderTag = async (order: any) => {
    // Format items summary (e.g., "3x Suits, 2x Shirts")
    let items: any[] = [];
    try {
      items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
    } catch (e) {
      items = [];
    }

    const itemsSummary = items.map((item: any) => {
      const qty = item.quantity || 1;
      const name = item.item_name || item.name || item.service_name || item.title || item.description || item.product_name || 'Item';
      return `${qty}x ${name}`;
    }).join('<br>');

    // Debug: log item structure
    console.log('Print tag items:', JSON.stringify(items, null, 2));

    // Calculate piece count - 2pc suit = 2 pieces, 3pc suit = 3 pieces, etc.
    const calculatePieces = (item: any) => {
      const name = (item.item_name || item.name || item.service_name || '').toLowerCase();
      const qty = item.quantity || 1;

      // Check for Xpc pattern (2pc, 3pc, etc.)
      const pcMatch = name.match(/(\d+)\s*pc/);
      if (pcMatch) {
        return qty * parseInt(pcMatch[1]);
      }

      // Default: 1 piece per item
      return qty;
    };

    const totalPieces = items.reduce((sum: number, i: any) => sum + calculatePieces(i), 0);

    const tagData = {
      storeName: settings.store_name || tenant?.name || 'Class 1 Dry Cleaners',
      ticketNumber: order.pos_ticket_id || order.readable_id || order.id?.slice(-6)?.toUpperCase() || '---',
      customerName: order.customer_name || 'Walk-in',
      customerPhone: order.customer_phone || '',
      customerAddress: order.customer_address || '',
      itemCount: totalPieces,
      items: items.map((i: any) => `${i.quantity || 1}x ${i.item_name || i.name || i.service_name || 'Item'}`).join(', '),
      itemsSummary: itemsSummary,
      dueDate: order.due_date ? new Date(order.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'TBD',
      notes: order.notes || '',
      orderId: order.id,
      qrData: order.readable_id || order.pos_ticket_id || order.id // QR code contains readable order ID for scanning
    };

    // Check if running in Electron
    if ((window as any).electronPrint) {
      const result = await (window as any).electronPrint.printTag(tagData);
      if (result.success) {
        showPrintToast('success', 'Tag sent to printer!');
      } else {
        showPrintToast('error', 'Print failed: ' + (result.error || 'Unknown error'));
      }
    } else {
      // Fallback: Open print preview in new window
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (printWindow) {
        printWindow.document.write(generatePrintTagHtml(tagData));
        printWindow.document.close();
        printWindow.print();
        showPrintToast('success', 'Print preview opened');
      } else {
        showPrintToast('warning', 'Pop-up blocked. Please allow pop-ups.');
      }
    }
  };

  // Generate print tag HTML for browser fallback
  const generatePrintTagHtml = (tagData: any) => `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Tag - #${tagData.ticketNumber}</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 62mm 100mm; margin: 0; }
        @media print { body { width: 62mm; height: 100mm; } }
        body { font-family: Arial, sans-serif; width: 62mm; padding: 3mm; background: white; color: black; }
        .tag { border: 1px solid #000; padding: 2mm; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 2mm; }
        .ticket { font-size: 16pt; font-weight: bold; }
        .count { background: #000; color: #fff; padding: 1mm 3mm; border-radius: 2mm; font-weight: bold; }
        .customer { border-bottom: 1px dashed #999; padding-bottom: 2mm; margin-bottom: 2mm; }
        .name { font-size: 14pt; font-weight: bold; }
        .phone, .address { font-size: 9pt; color: #333; }
        .items { border-bottom: 1px dashed #999; padding-bottom: 2mm; margin-bottom: 2mm; }
        .items-title { font-size: 8pt; font-weight: bold; color: #666; text-transform: uppercase; }
        .items-list { font-size: 10pt; line-height: 1.4; }
        .footer { display: flex; justify-content: space-between; align-items: flex-end; }
        .due { font-size: 10pt; font-weight: bold; }
        .qr { width: 18mm; height: 18mm; }
        .scan-text { font-size: 5pt; text-align: center; color: #666; }
      </style>
    </head>
    <body>
      <div class="tag">
        <div class="header">
          <span class="ticket">#${tagData.ticketNumber}</span>
          <span class="count">${tagData.itemCount} items</span>
        </div>
        <div class="customer">
          <div class="name">${tagData.customerName}</div>
          <div class="phone">${tagData.customerPhone}</div>
          <div class="address">${tagData.customerAddress}</div>
        </div>
        <div class="items">
          <div class="items-title">Order Items</div>
          <div class="items-list">${tagData.itemsSummary}</div>
        </div>
        <div class="footer">
          <div><div class="due">Due: ${tagData.dueDate}</div></div>
          <div><div class="qr" id="qr"></div><div class="scan-text">Scan to load</div></div>
        </div>
      </div>
      <script>
        var qr = qrcode(0, 'M');
        qr.addData('${tagData.orderId}');
        qr.make();
        document.getElementById('qr').innerHTML = qr.createSvgTag(2, 0);
      </script>
    </body>
    </html>
  `;

  // QR Scanner functions
  const startQRScanner = async () => {
    setShowQRScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        requestAnimationFrame(scanQRCode);
      }
    } catch (err) {
      alert('Could not access camera. Please check permissions.');
      setShowQRScanner(false);
    }
  };

  const stopQRScanner = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setShowQRScanner(false);
  };

  const scanQRCode = async () => {
    if (!showQRScanner || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Use jsQR library for reliable QR scanning
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        await loadScannedOrder(code.data);
        stopQRScanner();
        return;
      }

      // Fallback: Try BarcodeDetector API if available
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            const orderId = barcodes[0].rawValue;
            await loadScannedOrder(orderId);
            stopQRScanner();
            return;
          }
        } catch (e) {
          // BarcodeDetector failed, continue scanning
        }
      }
    }

    if (showQRScanner) {
      requestAnimationFrame(scanQRCode);
    }
  };

  const loadScannedOrder = async (orderId: string) => {
    try {
      // Clean up the input - remove # prefix if present
      const cleanId = orderId.replace(/^#/, '').trim();

      // First try to find by UUID (full id)
      let { data, error } = await supabase
        .from('cp_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      // If not found by UUID, try by readable_id
      if (error || !data) {
        const { data: dataByReadable, error: errorByReadable } = await supabase
          .from('cp_orders')
          .select('*')
          .eq('readable_id', cleanId.toUpperCase())
          .single();

        if (!errorByReadable && dataByReadable) {
          data = dataByReadable;
          error = null;
        }
      }

      // If still not found, try by pos_ticket_id
      if (error || !data) {
        const { data: dataByTicket, error: errorByTicket } = await supabase
          .from('cp_orders')
          .select('*')
          .eq('pos_ticket_id', cleanId)
          .single();

        if (!errorByTicket && dataByTicket) {
          data = dataByTicket;
          error = null;
        }
      }

      if (error || !data) {
        alert('Order not found: ' + orderId);
        return;
      }

      // Fetch order items separately (more reliable than join)
      const { data: orderItems, error: itemsError } = await supabase
        .from('cp_order_items')
        .select('*')
        .eq('order_id', data.id);

      console.log('Order items query:', { orderId: data.id, items: orderItems, error: itemsError });

      // Attach items to order
      if (orderItems && orderItems.length > 0) {
        data.items = orderItems;
      }

      // Debug: log order data to check items
      console.log('Scanned order data:', { id: data.id, items: data.items, itemCount: data.items?.length });

      setScannedOrder(data);
      setShowScannedOrderModal(true);
    } catch (err) {
      console.error('Error loading order:', err);
      alert('Error loading order');
    }
  };

  const handleManualOrderIdEntry = async (orderId: string) => {
    if (!orderId.trim()) return;
    await loadScannedOrder(orderId.trim());
    stopQRScanner();
  };

  // Fetch services for autocomplete/dropdown
  useEffect(() => {
    const loadServices = async () => {
      const { data } = await supabase.from('cp_services').select('*').eq('tenant_id', tenant.id);
      if (data) setAvailableServices(data);
    };
    loadServices();
  }, [tenant.id]);

  // Confirmation modal handlers
  const showDeleteConfirm = (type: 'service' | 'category' | 'all', id?: string, name?: string) => {
    setDeleteConfirm({ type, id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === 'all') {
      await executeClearAll();
    } else if (deleteConfirm.type === 'service' && deleteConfirm.id) {
      await executeDeleteService(deleteConfirm.id);
    } else if (deleteConfirm.type === 'category' && deleteConfirm.name) {
      await executeDeleteCategory(deleteConfirm.name);
    }

    setDeleteConfirm(null);
  };

  const executeClearAll = async () => {
    try {
      const { data: deletedServices, error: servicesError } = await supabase
        .from('cp_services')
        .delete()
        .eq('tenant_id', tenant.id)
        .select();

      if (servicesError) {
        console.error('Error deleting services:', servicesError);
        return;
      }

      const { data: deletedCategories, error: categoriesError } = await supabase
        .from('cp_categories')
        .delete()
        .eq('tenant_id', tenant.id)
        .select();

      if (categoriesError) {
        console.error('Error deleting categories:', categoriesError);
        return;
      }

      console.log(`Deleted ${deletedServices?.length || 0} services and ${deletedCategories?.length || 0} categories`);
      setServices([]);
      setCategories([]);
    } catch (err: any) {
      console.error('Unexpected error:', err);
    }
  };



  const openEditOrder = (order: any) => {
    setEditingOrder(order);
    try {
      const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
      setOrderItems(items);
      // Extract repair charge if it exists as a special item
      const repairItem = items.find((i: any) => i.id === 'repair_charge');
      setRepairCharge(repairItem ? repairItem.price : 0);
    } catch (e) {
      setOrderItems([]);
    }
    setIsEditOrderOpen(true);
  };

  const saveOrderChanges = async () => {
    if (!editingOrder) return;

    try {
      // Calculate new total using correct field names
      let newTotal = orderItems.reduce((sum, item) => {
        const price = item.unit_price || item.price || 0;
        const qty = item.quantity || 1;
        return sum + (price * qty);
      }, 0);

      // Add repair charge to total
      newTotal += repairCharge;

      // Delete existing order items
      await supabase.from('cp_order_items').delete().eq('order_id', editingOrder.id);

      // Build items list including repair charge if present
      const allItems = [...orderItems];
      if (repairCharge > 0) {
        allItems.push({
          item_name: 'Repair Charge',
          quantity: 1,
          unit_price: repairCharge
        });
      }

      // Insert updated order items
      if (allItems.length > 0) {
        const itemRows = allItems.map(item => ({
          order_id: editingOrder.id,
          item_name: item.item_name || item.name || item.service_name || 'Item',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.price || 0,
          tenant_id: tenant.id
        }));
        await supabase.from('cp_order_items').insert(itemRows);
      }

      // Update order total
      const { error } = await supabase.from('cp_orders').update({
        total_amount: newTotal
      }).eq('id', editingOrder.id);

      if (error) {
        showFancyAlert('error', 'Update Failed', 'Failed to update order: ' + error.message);
      } else {
        // Also update the associated invoice
        const invoiceItems = allItems.map(item => ({
          name: item.item_name || item.name || item.service_name || 'Item',
          quantity: item.quantity || 1,
          price: (item.unit_price || item.price || 0).toString()
        }));

        await supabase.from('cp_invoices').update({
          amount: newTotal,
          items: invoiceItems
        }).eq('order_id', editingOrder.id);

        showFancyAlert('success', 'Order Updated', `Order total is now £${newTotal.toFixed(2)}`);
        setIsEditOrderOpen(false);
        setEditingOrder(null);
        fetchOrders();
        fetchInvoices();
      }
    } catch (err: any) {
      showFancyAlert('error', 'Error', 'Failed to save changes: ' + err.message);
    }
  };

  const addServiceToOrder = (serviceId: string) => {
    const svc = availableServices.find(s => s.id === serviceId);
    if (!svc) return;
    const existing = orderItems.find(i => i.id === svc.id);
    if (existing) {
      setOrderItems(orderItems.map(i => i.id === svc.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setOrderItems([...orderItems, { id: svc.id, name: svc.name, price: svc.price_numeric, quantity: 1 }]);
    }
  };

  const removeOrderItem = (itemId: string) => {
    setOrderItems(orderItems.filter(i => i.id !== itemId));
  };

  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState({ name: '', phone: '', postcode: '' });
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [printerSettings, setPrinterSettings] = useState<any>({ printerName: '', defaultTagCount: 1, availablePrinters: [] });
  const [tenantForm, setTenantForm] = useState(tenant);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [bogoForm, setBogoForm] = useState<any>({ type: 'bogo', active: true, buy_qty: 3, get_qty: 1, included_items: [] });
  const [bundleForm, setBundleForm] = useState<any>({ type: 'bundle', active: true, bundle_qty: 5, bundle_price: 20, included_items: [] });
  const [isSavingPromo, setIsSavingPromo] = useState(false);
  const [newSlotTimes, setNewSlotTimes] = useState<Record<string, string>>({});
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('order_received');
  const [marketingSegment, setMarketingSegment] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [showSegmentList, setShowSegmentList] = useState(false);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [discountForm, setDiscountForm] = useState<any>({ code: '', discount_type: 'percentage', discount_value: 20, one_time_use: true, expiry_date: '', active: true });
  const [sortLocked, setSortLocked] = useState(true);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingService, setEditingService] = useState<any>(null);
  const [newService, setNewService] = useState({ category: '', subcategory: '', name: '', price: '' });
  const [isAddingService, setIsAddingService] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'service' | 'category' | 'all'; id?: string; name?: string } | null>(null);
  const [corporateAccounts, setCorporateAccounts] = useState<any[]>([]);
  const [newCorporate, setNewCorporate] = useState({ company_name: '', contact_name: '', email: '', phone: '', address: '', discount_percent: 10, credit_limit: 1000, payment_terms: 30 });
  const [editingCorporate, setEditingCorporate] = useState<any>(null);

  // Enhanced category syncing - ensure all categories used in services exist in the categories table
  const syncCategories = async () => {
    if (services.length === 0) {
      console.log('No services to sync categories from');
      return;
    }

    const usedCatNames = Array.from(new Set(services.map(s => s.category).filter(Boolean)));
    const existingCatNames = categories.map(c => c.name);
    const toCreate = usedCatNames.filter(name => !existingCatNames.includes(name));

    console.log('Category sync check:', { usedCatNames, existingCatNames, toCreate });

    if (toCreate.length > 0) {
      console.log('Syncing missing categories:', toCreate);

      // Insert categories one by one, update tenant_id if already exists
      let successCount = 0;
      for (let i = 0; i < toCreate.length; i++) {
        const name = toCreate[i];

        // First try to update existing category to our tenant
        const { data: updated, error: updateError } = await supabase
          .from('cp_categories')
          .update({ tenant_id: tenant.id })
          .eq('name', name)
          .select();

        if (updateError) {
          // If update fails, try insert
          const { data: inserted, error: insertError } = await supabase
            .from('cp_categories')
            .insert({
              name,
              sort_order: categories.length + i + 10,
              tenant_id: tenant.id
            })
            .select();

          if (insertError) {
            console.error(`Error syncing category "${name}":`, insertError);
          } else {
            console.log(`Category "${name}" inserted:`, inserted);
            successCount++;
          }
        } else if (updated && updated.length > 0) {
          console.log(`Category "${name}" updated to tenant:`, updated);
          successCount++;
        } else {
          // No rows updated means it doesn't exist, insert it
          const { data: inserted, error: insertError } = await supabase
            .from('cp_categories')
            .insert({
              name,
              sort_order: categories.length + i + 10,
              tenant_id: tenant.id
            })
            .select();

          if (insertError) {
            console.error(`Error inserting category "${name}":`, insertError);
          } else {
            console.log(`Category "${name}" inserted:`, inserted);
            successCount++;
          }
        }
      }

      console.log(`Synced ${successCount} of ${toCreate.length} categories`);
      fetchCategories();
    } else {
      console.log('All categories already synced');
    }
  };

  useEffect(() => {
    if (services.length > 0 && categories.length >= 0) {
      syncCategories();
    }
  }, [services.length]);
  const [voucherCode, setVoucherCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    fetchOrders(); fetchDrivers(); fetchSettings(); fetchServices(); fetchCategories(); fetchCustomers(); fetchPromotions(); fetchEmailTemplates(); fetchDiscountCodes();
  }, []);

  // Real-time subscription for order updates
  useEffect(() => {
    console.log('--- SETTING UP REALTIME SUBSCRIPTION FOR ORDERS ---');

    // Subscribe to changes in the cp_orders table
    const ordersSubscription = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events: INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'cp_orders'
        },
        (payload) => {
          console.log('Order change detected:', payload);
          // Refresh orders when any change occurs
          fetchOrders();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      console.log('--- CLEANING UP REALTIME SUBSCRIPTION ---');
      supabase.removeChannel(ordersSubscription);
    };
  }, []);

  const fetchEmailTemplates = async () => { const { data } = await supabase.from('cp_email_templates').select('*').eq('tenant_id', tenant.id); if (data && data.length > 0) { setEmailTemplates(data); if (!selectedTemplateId) setSelectedTemplateId(data[0].id); } };
  const fetchPromotions = async () => { const { data } = await supabase.from('cp_promotions').select('*').eq('tenant_id', tenant.id); if (data) setPromotions(data); };
  const fetchCustomers = async () => { const { data } = await supabase.from('cp_customers').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }); if (data) setCustomers(data); };
  const fetchInvoices = async () => { const { data } = await supabase.from('cp_invoices').select('*, cp_customers(name, email)').eq('tenant_id', tenant.id).order('created_at', { ascending: false }); if (data) setInvoices(data); };
  const fetchCategories = async () => { const { data } = await supabase.from('cp_categories').select('*').eq('tenant_id', tenant.id).order('sort_order', { ascending: true }); if (data) setCategories(data); };
  const fetchServices = async () => {
    try {
      const { data, error } = await supabase.from('cp_services').select('*').eq('tenant_id', tenant.id).order('category');
      if (error) {
        console.error('Error fetching services:', error);
        alert('Failed to refresh services list: ' + error.message);
      } else if (data) {
        setServices(data);
        setAvailableServices(data);
      }
    } catch (err: any) {
      console.error('Unexpected error in fetchServices:', err);
    }
  };
  const fetchOrders = async () => {
    console.log('--- FETCHING ORDERS FOR BACK OFFICE ---');
    const { data, error } = await supabase
      .from('cp_orders')
      .select('*, items:cp_order_items(*)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      setFetchError(error.message);
    } else {
      console.log('Orders fetched for Back Office:', data?.length || 0);
      setOrders(data || []);
      setFetchError(null);
    }
  };
  const fetchDrivers = async () => { const { data } = await supabase.from('cp_drivers').select('*').eq('tenant_id', tenant.id); if (data) setDrivers(data); };
  const fetchDiscountCodes = async () => { const { data } = await supabase.from('cp_discount_codes').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }); if (data) setDiscountCodes(data); };

  const handleMoveCategory = async (fromIndex: number, toIndex: number) => {
    if (sortLocked) return;
    const newCategories = [...categories];
    const [movedItem] = newCategories.splice(fromIndex, 1);
    newCategories.splice(toIndex, 0, movedItem);

    // Update locally for immediate feedback
    setCategories(newCategories);

    // Update each category's sort_order individually using name as identifier
    let hasError = false;
    for (let idx = 0; idx < newCategories.length; idx++) {
      const cat = newCategories[idx];
      const { error } = await supabase.from('cp_categories')
        .update({ sort_order: idx })
        .eq('name', cat.name)
        .eq('tenant_id', tenant.id);
      if (error) {
        console.error('Error saving order:', error);
        hasError = true;
        break;
      }
    }

    if (hasError) {
      alert('Failed to save order');
      fetchCategories(); // Revert on error
    } else {
      fetchCategories();
    }
  };

  const deleteCategory = (categoryName: string) => {
    if (!categoryName) return;
    showDeleteConfirm('category', undefined, categoryName);
  };

  const executeDeleteCategory = async (categoryName: string) => {
    console.log(`Deleting category "${categoryName}" and its services for tenant ${tenant.id}`);
    try {
      // First delete all services in this category
      const { data: deletedServices, error: servicesError } = await supabase
        .from('cp_services')
        .delete()
        .eq('category', categoryName)
        .eq('tenant_id', tenant.id)
        .select();

      if (servicesError) {
        console.error('Delete services error:', servicesError);
      } else {
        console.log(`Deleted ${deletedServices?.length || 0} services from category "${categoryName}"`);
        setServices(services.filter(s => s.category !== categoryName));
      }

      // Then delete the category itself
      const { data, error } = await supabase
        .from('cp_categories')
        .delete()
        .eq('name', categoryName)
        .eq('tenant_id', tenant.id)
        .select();

      if (error) {
        console.error('Delete category error:', error);
      } else {
        console.log('Delete category successful');
        setCategories(categories.filter(c => c.name !== categoryName));
      }
    } catch (err: any) {
      console.error('Unexpected error during category delete:', err);
    }
  };

  const addService = async () => {
    if (!newService.category || !newService.name || !newService.price) {
      alert('Please fill all fields for the new service.');
      return;
    }

    setIsAddingService(true);
    const priceNum = parseFloat(newService.price.replace(/[^\d.]/g, ''));
    if (isNaN(priceNum)) {
      alert('Invalid price format. Please enter a number.');
      setIsAddingService(false);
      return;
    }

    const { error } = await supabase.from('cp_services').insert([{
      category: newService.category,
      name: newService.name,
      price_numeric: priceNum,
      price_display: `£${priceNum.toFixed(2)}`,
      tenant_id: tenant.id
    }]);

    setIsAddingService(false);
    if (error) {
      alert('Failed to add service: ' + error.message);
    } else {
      setNewService({ category: '', subcategory: '', name: '', price: '' });
      fetchServices();
      // Ensure category exists in categories table too
      const { data: exist } = await supabase.from('cp_categories').select('name').eq('name', newService.category).eq('tenant_id', tenant.id).maybeSingle();
      if (!exist) {
        await supabase.from('cp_categories').insert([{ name: newService.category, sort_order: 99, tenant_id: tenant.id }]);
        fetchCategories();
      }
    }
  };

  const updateCustomerField = async (id: string, field: string, value: any) => {
    const { error } = await supabase.from('cp_customers').update({ [field]: value }).eq('id', id).eq('tenant_id', tenant.id);
    if (!error) fetchCustomers();
    else showFancyAlert('error', 'Update Failed', 'Failed to update: ' + error.message);
  };

  const processRecurringOrders = () => {
    showFancyConfirm({
      title: 'Process Recurring Orders',
      message: 'This will scan for subscriptions due this week and create "Pending" orders for them. Proceed?',
      icon: 'info',
      confirmText: 'Process',
      cancelText: 'Cancel',
      onConfirm: executeProcessRecurring
    });
  };

  const executeProcessRecurring = async () => {
    setFancyConfirm(prev => ({ ...prev, show: false }));
    try {
      // 1. Get all orders with recurring flag set
      // Note: For a real app, we should have a 'subscriptions' table. 
      // Here we infer from previous orders that are marked 'weekly' or 'bi-weekly'.
      // We select the LATEST order for each customer that was recurring.

      // 1. Get all customers with active subscriptions
      const { data: recurringCustomers, error } = await supabase
        .from('cp_customers')
        .select('*')
        .eq('tenant_id', tenant.id)
        .in('subscription_frequency', ['weekly', 'bi-weekly'])
        .eq('subscription_paused', false); // ONLY process active subscriptions

      if (error || !recurringCustomers) throw new Error('Failed to fetch recurring customers');

      let createdCount = 0;

      for (const customer of recurringCustomers) {
        // Find their last order to clone preference/address/items
        const { data: lastOrder } = await supabase
          .from('cp_orders')
          .select('*')
          .eq('customer_email', customer.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!lastOrder) continue;

        // Check date logic
        const lastDate = new Date(lastOrder.created_at);
        const freqDays = customer.subscription_frequency === 'weekly' ? 7 : 14;
        const nextDueDate = new Date(lastDate);
        nextDueDate.setDate(lastDate.getDate() + freqDays);

        const today = new Date();
        const diffTime = nextDueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 3) {
          // Check if we already have a pending order for this customer created recently (avoid duplicates)
          const { data: existing } = await supabase
            .from('cp_orders')
            .select('id')
            .eq('customer_email', customer.email)
            .eq('status', 'pending')
            .gt('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()) // Created in last 3 days
            .single();

          if (!existing) {
            const newOrder: any = {
              customer_id: customer.id,
              customer_name: customer.name,
              customer_email: customer.email,
              customer_phone: customer.phone,
              customer_address: customer.address,
              items: lastOrder.items || [],
              total_amount: lastOrder.total_amount || 0,
              status: 'pending',
              payment_status: 'unpaid',
              payment_method: 'saved_card',
              recurring_frequency: customer.subscription_frequency,
              tenant_id: tenant.id,
              slot_day: customer.subscription_day || 'Next Available',
              slot_time: '08:00 - 12:00',
              readable_id: 'R-' + Math.random().toString(36).substr(2, 6).toUpperCase()
            };

            await supabase.from('cp_orders').insert([newOrder]);
            createdCount++;
          }
        }
      }

      showFancyAlert('success', 'Process Complete', `Created ${createdCount} new recurring orders.`);
      fetchOrders();

    } catch (e: any) {
      showFancyAlert('error', 'Error', 'Error processing recurring: ' + e.message);
    }
  };

  const handleRedeemVoucher = async () => {
    if (!voucherCode) return;
    setIsRedeeming(true);

    try {
      // 1. Check if the pass exists and is not redeemed
      const { data: pass, error: fetchError } = await supabase
        .from('cp_partner_passes')
        .select('*')
        .eq('code', voucherCode.toUpperCase())
        .single();

      if (fetchError || !pass) {
        alert('Invalid voucher code. Please check and try again.');
        setIsRedeeming(false);
        return;
      }

      if (pass.is_redeemed) {
        alert('This voucher has already been redeemed.');
        setIsRedeeming(false);
        return;
      }

      // 2. Calculate expiry (now + duration_months)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + (pass.duration_months || 12));

      // 3. Update the pass record
      const { error: patchPassError } = await supabase
        .from('cp_partner_passes')
        .update({
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          redeemed_by_tenant_id: tenant.id,
          expires_at: expiryDate.toISOString()
        })
        .eq('id', pass.id);

      if (patchPassError) {
        throw new Error('Failed to update pass record: ' + patchPassError.message);
      }

      // 4. Update the tenant record
      const { error: updateTenantError } = await supabase
        .from('tenants')
        .update({
          pass_expires_at: expiryDate.toISOString(),
          subscription_status: 'active',
          trial_ends_at: expiryDate.toISOString() // Also update trial_ends_at for legacy logic
        })
        .eq('id', tenant.id);

      if (updateTenantError) {
        throw new Error('Failed to update tenant status: ' + updateTenantError.message);
      }

      alert(`Success! Voucher ${pass.code} redeemed. Your account is now active until ${expiryDate.toLocaleDateString()}.`);

      if (onTenantUpdate) {
        onTenantUpdate({
          ...tenant,
          pass_expires_at: expiryDate.toISOString(),
          subscription_status: 'active',
          trial_ends_at: expiryDate.toISOString()
        });
      }
      setVoucherCode('');
    } catch (err: any) {
      console.error('Redeem error:', err);
      alert('Error redeeming voucher: ' + err.message);
    } finally {
      setIsRedeeming(false);
    }
  };

  const saveCategory = async () => {
    if (!editingCategory) return;

    const oldName = editingCategory.originalName || editingCategory.name;
    const newName = editingCategory.name;

    if (oldName === newName) {
      setEditingCategory(null);
      return;
    }

    const { error } = await supabase.from('cp_categories')
      .update({ name: newName })
      .eq('name', oldName)
      .eq('tenant_id', tenant.id);

    if (error) {
      alert('Failed to save category: ' + error.message);
    } else {
      // Update all services in this category to new name
      console.log(`Updating services from category "${oldName}" to "${newName}"`);
      await supabase.from('cp_services')
        .update({ category: newName })
        .eq('category', oldName)
        .eq('tenant_id', tenant.id);
      fetchServices();
      setEditingCategory(null);
      fetchCategories();
    }
  };

  const deleteService = (id: string, name: string) => {
    if (!id) return;
    showDeleteConfirm('service', id, name);
  };

  const executeDeleteService = async (id: string) => {
    try {
      console.log(`Deleting service ${id} for tenant ${tenant.id}`);
      const { data, error } = await supabase.from('cp_services')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select();

      if (error) {
        console.error('Delete error:', error);
      } else {
        console.log('Delete successful, rows affected:', data?.length);
        setServices(services.filter(s => s.id !== id));
      }
    } catch (err: any) {
      console.error('Unexpected error during delete:', err);
    }
  };

  const saveService = async () => {
    if (!editingService) return;

    // Parse numeric value from string state
    const priceNum = typeof editingService.price_numeric === 'string'
      ? parseFloat(editingService.price_numeric.replace(/[^\d.]/g, ''))
      : editingService.price_numeric;

    if (isNaN(priceNum)) {
      alert('Invalid price format. Please enter a valid number.');
      return;
    }

    const newPriceDisplay = `£${priceNum.toFixed(2)}`;

    const { error } = await supabase.from('cp_services')
      .update({
        name: editingService.name,
        price_numeric: priceNum,
        price_display: newPriceDisplay
      })
      .eq('id', editingService.id)
      .eq('tenant_id', tenant.id);

    if (error) {
      alert('Failed to save service: ' + error.message);
    } else {
      setEditingService(null);
      fetchServices();
    }
  };
  const fetchSettings = async () => { const { data } = await supabase.from('cp_app_settings').select('*').eq('tenant_id', tenant.id); if (data) { const newSettings: any = {}; data.forEach((item: any) => { newSettings[item.key] = item.value; }); setSettings(prev => ({ ...prev, ...newSettings })); } };

  // Improved Save Handler with onConflict
  const handleSaveSettings = async (updatedSettings?: any) => {
    const toSave = updatedSettings || settings;
    const updates = Object.keys(toSave).map(key => ({ tenant_id: tenant.id, key, value: String(toSave[key] || '') }));
    setIsSavingPromo(true);
    const { error } = await supabase.from('cp_app_settings').upsert(updates, { onConflict: 'tenant_id,key' });
    setIsSavingPromo(false);
    if (!error) {
      setSettings(toSave); // Update local state
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const [editingDriver, setEditingDriver] = useState<any>(null);

  const openEditDriver = (driver: any) => {
    setEditingDriver(driver);
    setDriverForm({
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      vehicle_reg: driver.vehicle_reg || '',
      password_hash: driver.password_hash || '',
      working_days: driver.working_days || []
    });
  };


  const handleSaveTenantDetails = async () => {
    setIsSavingPromo(true);
    const { error } = await supabase.from('tenants').update({
      address: tenantForm.address,
      town_city: tenantForm.town_city,
      postcode: tenantForm.postcode,
      seo_title: tenantForm.seo_title,
      seo_description: tenantForm.seo_description,
      seo_keywords: tenantForm.seo_keywords,
      social_facebook: tenantForm.social_facebook,
      social_instagram: tenantForm.social_instagram
    }).eq('id', tenant.id);
    setIsSavingPromo(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      alert('Local SEO & Store Location saved!');
      if (onTenantUpdate) onTenantUpdate(tenantForm);
    } else {
      alert('Failed: ' + error.message);
    }
  };

  const updatePosTicket = async (orderId: string, ticketId: string) => { await supabase.from('cp_orders').update({ pos_ticket_id: ticketId }).eq('id', orderId); setOrders(orders.map(o => o.id === orderId ? { ...o, pos_ticket_id: ticketId } : o)); };
  const saveBogoPromotion = async () => {
    if (bogoForm.included_items.length === 0) {
      alert('Please select at least one item for this promotion.');
      return;
    }
    const promoData = { ...bogoForm, name: 'Buy X Get Y Free', tenant_id: tenant.id };
    setIsSavingPromo(true);
    console.log('Attempting to save BOGO:', promoData);
    const { data, error } = await supabase.from('cp_promotions').insert([promoData]).select();
    setIsSavingPromo(false);
    if (error) {
      console.error('BOGO Save Error:', error);
      alert('Error saving BOGO promotion: ' + error.message);
    } else if (data && data.length > 0) {
      console.log('BOGO Saved Successfully:', data[0]);
      setPromotions([...promotions, data[0]]);
      alert('BOGO Promotion saved successfully!');
      setBogoForm({ type: 'bogo', active: true, buy_qty: 3, get_qty: 1, included_items: [] });
    } else {
      console.warn('BOGO saved but no data returned');
      fetchPromotions();
      setBogoForm({ type: 'bogo', active: true, buy_qty: 3, get_qty: 1, included_items: [] });
    }
  };
  const saveBundlePromotion = async () => {
    if (bundleForm.included_items.length === 0) {
      alert('Please select at least one item for this promotion.');
      return;
    }
    const promoData = { ...bundleForm, name: 'Bundle Deal', tenant_id: tenant.id };
    setIsSavingPromo(true);
    console.log('Attempting to save Bundle:', promoData);
    const { data, error } = await supabase.from('cp_promotions').insert([promoData]).select();
    setIsSavingPromo(false);
    if (error) {
      console.error('Bundle Save Error:', error);
      alert('Error saving Bundle promotion: ' + error.message);
    } else if (data && data.length > 0) {
      console.log('Bundle Saved Successfully:', data[0]);
      setPromotions([...promotions, data[0]]);
      alert('Bundle Promotion saved successfully!');
      setBundleForm({ type: 'bundle', active: true, bundle_qty: 5, bundle_price: 20, included_items: [] });
    } else {
      console.warn('Bundle saved but no data returned');
      fetchPromotions();
      setBundleForm({ type: 'bundle', active: true, bundle_qty: 5, bundle_price: 20, included_items: [] });
    }
  };
  const deletePromo = async (id: string) => { await supabase.from('cp_promotions').delete().eq('id', id).eq('tenant_id', tenant.id); setPromotions(promotions.filter(p => p.id !== id)); };

  const saveDriver = async () => {
    if (!driverForm.name || !driverForm.email) {
      alert('Please enter driver name and email');
      return;
    }

    const driverData: any = {
      name: driverForm.name,
      email: driverForm.email,
      phone: driverForm.phone,
      vehicle_reg: driverForm.vehicle_reg,
      working_days: driverForm.working_days,
      active: true
    };

    // Only include password if provided or if it's a new driver (hash the password)
    if (driverForm.password_hash) {
      driverData.password_hash = await hashPassword(driverForm.password_hash);
    }

    if (editingDriver) {
      const { error } = await supabase.from('cp_drivers').update(driverData).eq('id', editingDriver.id);
      if (!error) {
        setDrivers(drivers.map(d => d.id === editingDriver.id ? { ...editingDriver, ...driverData } : d));
        setEditingDriver(null);
        setDriverForm({ name: '', email: '', phone: '', vehicle_reg: '', password_hash: '', working_days: [] });
        showFancyAlert('success', 'Driver Updated', 'Driver details have been updated successfully.');
      } else {
        showFancyAlert('error', 'Error', 'Error updating driver: ' + error.message);
      }
    } else {
      if (!driverForm.password_hash) {
        alert('Please set a password for the new driver');
        return;
      }
      const newDriverData = {
        ...driverData,
        tenant_id: tenant.id
      };

      setIsSavingPromo(true);
      const { data, error } = await supabase.from('cp_drivers').insert([newDriverData]).select();
      setIsSavingPromo(false);
      if (!error && data) {
        setDrivers([...drivers, data[0]]);
        setDriverForm({ name: '', email: '', phone: '', vehicle_reg: '', password_hash: '', working_days: [] });
        showFancyAlert('success', 'Driver Added', 'New driver has been added successfully.');
      } else {
        showFancyAlert('error', 'Error', 'Error: ' + (error?.message || 'Failed to add driver'));
      }
    }
  };

  const deleteDriver = (id: string) => {
    showFancyConfirm({
      title: 'Delete Driver',
      message: 'Are you sure you want to delete this driver? This action cannot be undone.',
      icon: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setFancyConfirm(prev => ({ ...prev, show: false }));
        await supabase.from('cp_drivers').delete().eq('id', id).eq('tenant_id', tenant.id);
        setDrivers(drivers.filter(d => d.id !== id));
        showFancyAlert('success', 'Deleted', 'Driver has been deleted successfully.');
      }
    });
  };

  const toggleDriverDay = (day: string) => {
    const days = [...driverForm.working_days];
    if (days.includes(day)) {
      setDriverForm({ ...driverForm, working_days: days.filter(d => d !== day) });
    } else {
      setDriverForm({ ...driverForm, working_days: [...days, day] });
    }
  };

  const saveCustomer = async () => { if (!editingCustomer) return; const { error } = await supabase.from('cp_customers').update({ name: editingCustomer.name, phone: editingCustomer.phone, email: editingCustomer.email, address: editingCustomer.address }).eq('id', editingCustomer.id).eq('tenant_id', tenant.id); if (!error) { setCustomers(customers.map(c => c.id === editingCustomer.id ? editingCustomer : c)); setEditingCustomer(null); } };

  const toggleSubscriptionPause = async (customer: any) => {
    const newStatus = !customer.subscription_paused;
    const { error } = await supabase.from('cp_customers').update({ subscription_paused: newStatus }).eq('id', customer.id);

    if (error) {
      alert('Failed to update subscription status');
    } else {
      // Update local state
      setCustomers(customers.map(c => c.id === customer.id ? { ...c, subscription_paused: newStatus } : c));
    }
  };
  const toggleDay = async (day: string) => { const key = `day_active_${day}`; const newVal = settings[key] === 'true' ? 'false' : 'true'; handleSaveSettings({ ...settings, [key]: newVal }); };
  const addSlotToDay = async (day: string) => { const time = newSlotTimes[day]; if (!time) return; const { data, error } = await supabase.from('cp_time_slots').insert([{ day, label: time, active: true, tenant_id: tenant.id }]).select(); if (error) { alert('Failed to add slot: ' + error.message); } else if (data) { setAvailableSlots([...availableSlots, data[0] as TimeSlot]); setNewSlotTimes({ ...newSlotTimes, [day]: '' }); } };
  const deleteSlot = async (id: string) => { await supabase.from('cp_time_slots').delete().eq('id', id).eq('tenant_id', tenant.id); setAvailableSlots(availableSlots.filter(s => s.id !== id)); };
  const updateOrderStatus = async (orderId: string, status: string) => { await supabase.from('cp_orders').update({ status }).eq('id', orderId); fetchOrders(); };

  const openCollectionFailedModal = (orderId: string) => {
    setCollectionFailedOrderId(orderId);
    setCollectionFailedReason('');
    setShowCollectionFailedModal(true);
  };

  const handleCollectionFailed = async () => {
    if (!collectionFailedOrderId || !collectionFailedReason.trim()) {
      alert('Please provide a reason for the failed collection.');
      return;
    }

    const { error } = await supabase
      .from('cp_orders')
      .update({
        status: 'collection_failed',
        collection_status: 'collection_failed',
        collection_failed_reason: collectionFailedReason.trim(),
        collection_failed_at: new Date().toISOString()
      })
      .eq('id', collectionFailedOrderId);

    if (!error) {
      alert('Collection marked as failed. The order has been flagged for follow-up.');
      setShowCollectionFailedModal(false);
      setCollectionFailedOrderId(null);
      setCollectionFailedReason('');
      fetchOrders();
    } else {
      alert('Error updating order: ' + error.message);
    }
  };

  const updateOrderDriver = async (orderId: string, driverId: string) => {
    await supabase.from('cp_orders').update({
      driver_id: driverId,
      collection_driver_id: driverId,
      delivery_driver_id: driverId
    }).eq('id', orderId);
    fetchOrders();
  };
  const togglePromoItem = (formType: 'bogo' | 'bundle', itemName: string) => { if (formType === 'bogo') { const items = bogoForm.included_items || []; if (items.includes(itemName)) { setBogoForm({ ...bogoForm, included_items: items.filter((i: string) => i !== itemName) }); } else { setBogoForm({ ...bogoForm, included_items: [...items, itemName] }); } } else { const items = bundleForm.included_items || []; if (items.includes(itemName)) { setBundleForm({ ...bundleForm, included_items: items.filter((i: string) => i !== itemName) }); } else { setBundleForm({ ...bundleForm, included_items: [...items, itemName] }); } } };
  const toggleCatExpand = (catName: string) => { if (expandedCategories.includes(catName)) { setExpandedCategories(expandedCategories.filter(c => c !== catName)); } else { setExpandedCategories([...expandedCategories, catName]); } };
  const updateTemplate = (id: string, field: 'subject' | 'body' | 'name', value: string) => { setEmailTemplates(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t)); };
  const createNewTemplate = () => {
    const newId = crypto.randomUUID();
    const newT: EmailTemplate = { id: newId, name: 'New Template', subject: 'New Subject', body: 'New Body', type: 'marketing', variables: ['name', 'orderId'] };
    setEmailTemplates([...emailTemplates, newT]);
    setSelectedTemplateId(newId);
  };
  const saveTemplate = async () => {
    if (!selectedTemplate) return;
    const { error } = await supabase.from('cp_email_templates').upsert({
      id: selectedTemplate.id,
      name: selectedTemplate.name,
      subject: selectedTemplate.subject,
      body: selectedTemplate.body,
      type: selectedTemplate.type,
      variables: selectedTemplate.variables,
      tenant_id: tenant.id
    });
    if (!error) {
      alert('Template saved successfully!');
      fetchEmailTemplates();
    } else {
      console.error(error);
      alert('Failed to save template. Error: ' + error.message);
    }
  };

  const saveDiscountCode = async () => {
    if (!discountForm.code) { alert('Please enter a code.'); return; }
    setIsSavingPromo(true);
    const { data, error } = await supabase.from('cp_discount_codes').insert([{ ...discountForm, tenant_id: tenant.id }]).select();
    setIsSavingPromo(false);
    if (!error && data) {
      setDiscountCodes([data[0], ...discountCodes]);
      setDiscountForm({ code: '', discount_type: 'percentage', discount_value: 20, one_time_use: true, expiry_date: '', active: true });
      alert('Discount code saved!');
    } else {
      console.error(error);
      alert('Error saving code: ' + (error?.message || 'Unknown error'));
    }
  };

  const deleteDiscountCode = async (id: string) => {
    const { error } = await supabase.from('cp_discount_codes').delete().eq('id', id).eq('tenant_id', tenant.id);
    if (!error) setDiscountCodes(discountCodes.filter(c => c.id !== id));
  };

  const applyMarketingFilter = (filter: string) => {
    setActiveFilter(filter);
    let filtered = [...customers];
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    if (filter === 'inactive') {
      filtered = customers.filter(c => {
        const lastOrder = orders.find(o => o.customer_email === c.email);
        return lastOrder && new Date(lastOrder.created_at) < fourWeeksAgo;
      });
    } else if (filter === 'one-timer') {
      filtered = customers.filter(c => {
        const orderCount = orders.filter(o => o.customer_email === c.email).length;
        return orderCount === 1;
      });
    } else if (filter === 'laundry-only') {
      filtered = customers.filter(c => {
        const customerOrders = orders.filter(o => o.customer_email === c.email);
        if (customerOrders.length === 0) return false;
        return customerOrders.every(o => o.items?.every((i: any) =>
          services.find(s => s.name === i.name)?.category?.toLowerCase().includes('laundry'))
        );
      });
    } else if (filter === 'dry-cleaning-only') {
      filtered = customers.filter(c => {
        const customerOrders = orders.filter(o => o.customer_email === c.email);
        if (customerOrders.length === 0) return false;
        return customerOrders.every(o => o.items?.every((i: any) =>
          services.find(s => s.name === i.name)?.category?.toLowerCase().includes('dry cleaning'))
        );
      });
    }
    setMarketingSegment(filtered);
  };
  const handleSendTestEmail = async () => {
    if (!selectedTemplate) return;
    if (!testEmailRecipient) {
      alert("Please enter a recipient email address.");
      return;
    }
    const result = await sendBrevoEmail({
      toEmail: testEmailRecipient,
      toName: 'Test Recipient',
      subject: `[TEST] ${selectedTemplate.subject}`,
      textContent: selectedTemplate.body,
      senderName: tenant?.name
    });
    if (result.success) {
      alert("Test email sent successfully!");
    } else {
      alert("Failed to send test email. Check console for details.");
    }
  };
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);
  const [celebrationPopup, setCelebrationPopup] = useState<{ show: boolean; successCount: number; failCount: number } | null>(null);
  const [confirmCampaignModal, setConfirmCampaignModal] = useState(false);

  const handleSendCampaignClick = () => {
    if (!selectedTemplate) return;
    if (marketingSegment.length === 0) {
      alert("No customers in the selected segment. Please select a different segment.");
      return;
    }
    setConfirmCampaignModal(true);
  };

  const handleSendCampaign = async () => {
    setConfirmCampaignModal(false);
    if (!selectedTemplate) return;

    setIsSendingCampaign(true);
    let successCount = 0;
    let failCount = 0;

    for (const customer of marketingSegment) {
      if (!customer.email) {
        failCount++;
        continue;
      }
      // Replace template variables
      let subject = selectedTemplate.subject
        .replace(/\{\{customer_name\}\}/g, customer.name || 'Valued Customer')
        .replace(/\{\{store_name\}\}/g, tenant?.name || 'Our Store');
      let body = selectedTemplate.body
        .replace(/\{\{customer_name\}\}/g, customer.name || 'Valued Customer')
        .replace(/\{\{store_name\}\}/g, tenant?.name || 'Our Store');

      const result = await sendBrevoEmail({
        toEmail: customer.email,
        toName: customer.name || 'Customer',
        subject: subject,
        textContent: body,
        senderName: tenant?.name
      });

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    setIsSendingCampaign(false);
    setCelebrationPopup({ show: true, successCount, failCount });
  };
  const selectedTemplate = emailTemplates.find(t => t.id === selectedTemplateId);
  const filteredCustomers = customers.filter(c => (c.name || '').toLowerCase().includes(customerFilter.name.toLowerCase()) && (c.phone || '').includes(customerFilter.phone) && (c.address || '').toLowerCase().includes(customerFilter.postcode.toLowerCase()));
  const renderServiceSelector = (formType: 'bogo' | 'bundle', currentItems: string[]) => {
    // Merge categories from table and services to ensure nothing is missed
    const catNamesFromTable = categories.map(c => c.name);
    const catNamesFromServices = Array.from(new Set(services.map(s => s.category))).filter(Boolean) as string[];
    const effectiveCategories = Array.from(new Set([...catNamesFromTable, ...catNamesFromServices])).sort((a, b) => {
      const catA = categories.find(c => c.name === a);
      const catB = categories.find(c => c.name === b);
      return (catA?.sort_order ?? 999) - (catB?.sort_order ?? 999);
    });

    if (effectiveCategories.length === 0) {
      return (
        <div className="mt-4 p-6 border-2 border-dashed border-gray-200 rounded-xl text-center">
          <p className="text-sm text-gray-500 mb-2 font-medium">No services found to pick from.</p>
          <p className="text-xs text-gray-400">Please go to the "Services" tab and upload your price list first.</p>
        </div>
      );
    }

    return (
      <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase flex justify-between items-center">
          <span>Included Items</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const allNames = services.map(s => s.name);
                if (formType === 'bogo') setBogoForm({ ...bogoForm, included_items: allNames });
                else setBundleForm({ ...bundleForm, included_items: allNames });
              }}
              className="text-[10px] text-trust-blue hover:underline"
            >
              Select All
            </button>
            <button
              onClick={() => {
                if (formType === 'bogo') setBogoForm({ ...bogoForm, included_items: [] });
                else setBundleForm({ ...bundleForm, included_items: [] });
              }}
              className="text-[10px] text-gray-400 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto bg-white p-2">
          {effectiveCategories.map(catName => {
            const catServices = services.filter(s => s.category === catName);
            if (catServices.length === 0) return null;
            const isExpanded = expandedCategories.includes(catName);
            return (
              <div key={catName} className="mb-1">
                <div onClick={() => toggleCatExpand(catName)} className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-100">
                  <span className="font-bold text-sm text-gray-700">{catName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{catServices.length} items</span>
                    {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="pl-2 mt-1 space-y-1 animate-fade-in">
                    {catServices.map(svc => (
                      <div key={svc.id || svc.name} className="flex justify-between items-center text-sm pl-4 pr-1 py-1 group hover:bg-gray-50 rounded">
                        <span className="text-gray-600 group-hover:text-gray-900 transition-colors">{svc.name}</span>
                        <button
                          onClick={() => togglePromoItem(formType, svc.name)}
                          className={`w-10 h-5 rounded-full flex items-center transition-all duration-300 px-1 ${currentItems.includes(svc.name) ? 'bg-trust-blue justify-end' : 'bg-gray-300 justify-start'}`}
                        >
                          <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="bg-gray-50 px-3 py-1.5 text-xs text-gray-600 font-bold text-right border-t border-gray-200">
          {currentItems.length} items selected
        </div>
      </div>
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    const processRows = async (rows: any[][]) => {
      const newServices: any[] = [];
      const newCategories = new Set<string>();

      // Detect format from header row
      const headerRow = rows[0]?.map(h => String(h || '').toLowerCase()) || [];
      const menu1Idx = headerRow.findIndex(h => h.includes('menu1'));
      const menu2Idx = headerRow.findIndex(h => h.includes('menu2'));
      const titleIdx = headerRow.findIndex(h => h.includes('title'));
      const priceIdx = headerRow.findIndex(h => h.includes('price') || h.includes('pricelevel'));
      const categoryIdx = headerRow.findIndex(h => h.includes('category'));
      const nameIdx = headerRow.findIndex(h => h.includes('name') || h.includes('service'));

      const isNewFormat = menu1Idx !== -1 && titleIdx !== -1 && priceIdx !== -1;
      const isOldFormat = categoryIdx !== -1 && nameIdx !== -1;
      const hasHeader = isNewFormat || isOldFormat || headerRow.some(h => h.includes('menu') || h.includes('category') || h.includes('title'));
      const startIdx = hasHeader ? 1 : 0;

      console.log('Detected format:', { isNewFormat, isOldFormat, hasHeader, headerRow });

      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(cell => !cell)) continue;

        if (isNewFormat) {
          // New format: Menu1, Menu2, Title, Pricelevel1
          const menu1 = String(row[menu1Idx] || '').trim();
          const title = String(row[titleIdx] || '').trim();
          const priceVal = row[priceIdx];
          const price = typeof priceVal === 'number' ? priceVal : parseFloat(String(priceVal || '').replace(/[^0-9.]/g, ''));

          if (menu1 && title && !isNaN(price)) {
            newServices.push({
              category: menu1,
              name: title,
              price_numeric: price,
              price_display: `£${price.toFixed(2)}`,
              tenant_id: tenant.id
            });
            newCategories.add(menu1);
          }
        } else if (isOldFormat) {
          // Old format with headers: Category, Name, Price
          const category = String(row[categoryIdx] || '').trim();
          const name = String(row[nameIdx] || '').trim();
          const priceCol = row[priceIdx !== -1 ? priceIdx : 2];
          const price = typeof priceCol === 'number' ? priceCol : parseFloat(String(priceCol || '').replace(/[^0-9.]/g, ''));

          if (category && name && !isNaN(price)) {
            newServices.push({
              category,
              name,
              price_numeric: price,
              price_display: `£${price.toFixed(2)}`,
              tenant_id: tenant.id
            });
            newCategories.add(category);
          }
        } else if (row.length >= 4) {
          // Assume Menu1, Menu2, Title, Price format by position
          const menu1 = String(row[0] || '').trim();
          const title = String(row[2] || '').trim();
          const priceVal = row[3];
          const price = typeof priceVal === 'number' ? priceVal : parseFloat(String(priceVal || '').replace(/[^0-9.]/g, ''));

          if (menu1 && title && !isNaN(price)) {
            newServices.push({
              category: menu1,
              name: title,
              price_numeric: price,
              price_display: `£${price.toFixed(2)}`,
              tenant_id: tenant.id
            });
            newCategories.add(menu1);
          }
        } else if (row.length >= 3) {
          // Old format: Category, Name, Price by position
          const category = String(row[0] || '').trim();
          const name = String(row[1] || '').trim();
          const priceVal = row[2];
          const price = typeof priceVal === 'number' ? priceVal : parseFloat(String(priceVal || '').replace(/[^0-9.]/g, ''));

          if (category && name && !isNaN(price)) {
            newServices.push({
              category,
              name,
              price_numeric: price,
              price_display: `£${price.toFixed(2)}`,
              tenant_id: tenant.id
            });
            newCategories.add(category);
          }
        }
      }

      if (newServices.length > 0) {
        const categoryData = Array.from(newCategories).map((name, idx) => ({ name, sort_order: idx + 99 }));
        for (const cat of categoryData) {
          const { data: exist } = await supabase.from('cp_categories').select('name').eq('name', cat.name).eq('tenant_id', tenant.id).maybeSingle();
          if (!exist) await supabase.from('cp_categories').insert([{ ...cat, tenant_id: tenant.id }]);
        }

        const { error } = await supabase.from('cp_services').insert(newServices);

        if (!error) {
          alert(`Imported ${newServices.length} services successfully.`);
          fetchServices();
          fetchCategories();
        } else {
          alert('Import failed: ' + error.message);
        }
      } else {
        alert('No valid rows found. Supported formats:\n- Menu1, Menu2, Title, Pricelevel1\n- Category, Name, Price');
      }
    };

    if (isExcel) {
      // Handle Excel files
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          await processRows(rows);
        } catch (err: any) {
          alert('Failed to read Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle CSV files
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (!text) return;
        const rows = text.split(/\r\n|\n/).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
        await processRows(rows);
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  return (
    <div className="pt-10 pb-20 mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in dark:text-gray-100 transition-colors max-w-[1800px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div><h1 className="font-heading font-bold text-3xl text-gray-900 dark:text-gray-100">Back Office</h1><p className="text-gray-600 dark:text-gray-400">Administrative Dashboard</p></div>
        <div className="flex items-center gap-2 mt-4 md:mt-0">
          <button
            onClick={() => setShowHelpGuide(true)}
            className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:from-purple-600 hover:to-indigo-700 transition-all shadow-lg hover:shadow-purple-500/25 flex items-center gap-2 transform hover:scale-105 active:scale-95"
          >
            <FileText size={18} /> How to Use
          </button>
          <ThemeToggle darkMode={darkMode} toggle={toggleDark} />
          <div className="bg-blue-50 dark:bg-blue-900/20 text-trust-blue dark:text-trust-blue-light px-3 py-1 rounded-full text-xs font-bold uppercase">Admin Mode</div>
          <button onClick={onLogout} className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition flex items-center gap-2">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-8 inline-flex flex-wrap gap-y-2">
        <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'orders' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><ShoppingBag size={16} /> Orders</button>
        <button onClick={() => setActiveTab('store')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'store' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Settings size={16} /> Store Details</button>
        <button onClick={() => setActiveTab('customers')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'customers' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Users size={16} /> Customers</button>
        <button onClick={() => setActiveTab('corporate')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'corporate' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Building2 size={16} /> Corporate</button>
        <button onClick={() => setActiveTab('subscriptions')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'subscriptions' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Repeat size={16} /> Subscriptions</button>
        <button onClick={() => setActiveTab('offers')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'offers' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Tag size={16} /> Offers & Loyalty</button>
        <button onClick={() => setActiveTab('schedule')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'schedule' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Clock size={16} /> Schedule</button>
        <button onClick={() => setActiveTab('service')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'service' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Shirt size={16} /> Services</button>
        <button onClick={() => setActiveTab('marketing')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'marketing' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Mail size={16} /> Marketing</button>
        <button onClick={() => setActiveTab('drivers')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'drivers' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><Truck size={16} /> Drivers</button>
        <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'reports' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><TrendingUp size={16} /> Reports</button>
        <button onClick={() => setActiveTab('billing')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'billing' ? 'bg-white dark:bg-gray-700 text-trust-blue shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><CreditCard size={16} /> Subscription & Billing</button>
      </div>

      {activeTab === 'store' && (
        <div className="space-y-8 animate-fade-in">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} className="text-trust-blue" /> Store Details (Invoice Settings)</h3><button onClick={() => handleSaveSettings()} className="bg-trust-blue text-white px-6 py-2 rounded-lg font-bold hover:bg-trust-blue-hover transition flex items-center gap-2"><Save size={16} /> {saved ? 'Saved!' : 'Save Changes'}</button></div>
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-trust-blue/20 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-trust-blue uppercase mb-1">Your Store URL</p>
                <p className="font-mono font-bold text-gray-900 dark:text-white">{tenant.subdomain}.cleanpos.app</p>
              </div>
              <button onClick={() => window.open(`https://${tenant.subdomain}.cleanpos.app`, '_blank')} className="text-trust-blue hover:underline text-sm font-bold flex items-center gap-1">Visit Store <ExternalLink size={14} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="block text-sm font-bold text-gray-700 mb-1">Store Name</label><input type="text" className="w-full border rounded p-2" value={settings.store_name || ''} onChange={e => setSettings({ ...settings, store_name: e.target.value })} /></div><div><label className="block text-sm font-bold text-gray-700 mb-1">VAT Number</label><input type="text" className="w-full border rounded p-2" value={settings.store_vat || ''} onChange={e => setSettings({ ...settings, store_vat: e.target.value })} /></div><div><label className="block text-sm font-bold text-gray-700 mb-1">Email Address (Order Copies)</label><input type="email" className="w-full border rounded p-2" value={settings.store_email || ''} onChange={e => setSettings({ ...settings, store_email: e.target.value })} /></div><div><label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label><input type="text" className="w-full border rounded p-2" value={settings.store_phone || ''} onChange={e => setSettings({ ...settings, store_phone: e.target.value })} /></div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 md:col-span-2">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase"><Layers size={16} className="text-trust-blue" /> Branding & Theme</h4>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Header Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" className="w-12 h-12 rounded-lg cursor-pointer border-2 border-white shadow-sm" value={settings.header_color || '#030712'} onChange={e => setSettings({ ...settings, header_color: e.target.value })} />
                      <input type="text" className="flex-1 border rounded p-2 text-sm font-mono" value={settings.header_color || '#030712'} onChange={e => setSettings({ ...settings, header_color: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Footer Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" className="w-12 h-12 rounded-lg cursor-pointer border-2 border-white shadow-sm" value={settings.footer_color || '#030712'} onChange={e => setSettings({ ...settings, footer_color: e.target.value })} />
                      <input type="text" className="flex-1 border rounded p-2 text-sm font-mono" value={settings.footer_color || '#030712'} onChange={e => setSettings({ ...settings, footer_color: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-1">Store Address</label><textarea rows={3} className="w-full border rounded p-2" value={settings.store_address || ''} onChange={e => setSettings({ ...settings, store_address: e.target.value })} /></div><div className="md:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-1">Invoice Footer Text</label><textarea rows={2} className="w-full border rounded p-2" value={settings.invoice_footer || ''} onChange={e => setSettings({ ...settings, invoice_footer: e.target.value })} /></div></div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg flex items-center gap-2"><Globe size={20} className="text-trust-blue" /> Regional SEO & Location</h3>
              <button onClick={handleSaveTenantDetails} disabled={isSavingPromo} className="bg-eco-green text-white px-6 py-2 rounded-lg font-bold hover:bg-green-600 transition flex items-center gap-2">
                {isSavingPromo ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saved ? 'Saved!' : 'Save SEO & Location'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Store Street Address</label>
                    <input type="text" className="w-full border rounded p-2" value={tenantForm.address || ''} onChange={e => setTenantForm({ ...tenantForm, address: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Town / City</label>
                    <input type="text" className="w-full border rounded p-2" value={tenantForm.town_city || ''} onChange={e => setTenantForm({ ...tenantForm, town_city: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Postcode</label>
                    <input type="text" className="w-full border rounded p-2" value={tenantForm.postcode || ''} onChange={e => setTenantForm({ ...tenantForm, postcode: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border rounded-xl space-y-4">
                <h4 className="font-bold text-sm text-trust-blue uppercase">Google Search Appearance</h4>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">SEO Title Tag</label>
                  <input type="text" className="w-full border rounded p-2 text-sm" value={tenantForm.seo_title || ''} onChange={e => setTenantForm({ ...tenantForm, seo_title: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Meta Description</label>
                  <textarea rows={3} className="w-full border rounded p-2 text-sm" value={tenantForm.seo_description || ''} onChange={e => setTenantForm({ ...tenantForm, seo_description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">SEO Keywords (comma separated)</label>
                  <input type="text" className="w-full border rounded p-2 text-sm" value={tenantForm.seo_keywords || ''} onChange={e => setTenantForm({ ...tenantForm, seo_keywords: e.target.value })} />
                </div>
              </div>

              <div className="p-4 bg-gray-50 border rounded-xl space-y-4">
                <h4 className="font-bold text-sm text-pink-600 uppercase">Social Media Links</h4>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Facebook URL</label>
                  <input type="text" className="w-full border rounded p-2 text-sm" value={tenantForm.social_facebook || ''} onChange={e => setTenantForm({ ...tenantForm, social_facebook: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Instagram URL</label>
                  <input type="text" className="w-full border rounded p-2 text-sm" value={tenantForm.social_instagram || ''} onChange={e => setTenantForm({ ...tenantForm, social_instagram: e.target.value })} />
                </div>
                <div className="mt-4 p-3 bg-white border border-dashed rounded text-xs text-gray-500">
                  <Info size={14} className="inline mr-1 text-trust-blue" />
                  These links will automatically update your store's footer and schema markup.
                </div>
              </div>
            </div>
          </div>

          {/* Print Settings Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg flex items-center gap-2"><Printer size={20} className="text-pink-600" /> Label Printer Settings</h3>
              {(window as any).electronPrint && (
                <button
                  onClick={async () => {
                    try {
                      const printers = await (window as any).electronPrint.getPrinters();
                      setPrinterSettings((prev: any) => ({ ...prev, availablePrinters: printers }));
                      alert('Found ' + printers.length + ' printers:\n' + printers.map((p: any) => p.name).join('\n'));
                    } catch (e: any) {
                      alert('Error getting printers: ' + e.message);
                    }
                  }}
                  className="text-xs bg-pink-100 text-pink-700 px-3 py-1 rounded-full font-bold hover:bg-pink-200"
                >
                  Detect Printers
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Default Number of Tags</label>
                <p className="text-xs text-gray-500 mb-2">How many tags to print by default when clicking the Tag button</p>
                <select
                  className="w-full border rounded p-2"
                  value={settings.default_tag_count || 1}
                  onChange={e => setSettings({ ...settings, default_tag_count: parseInt(e.target.value) })}
                >
                  <option value={1}>1 tag</option>
                  <option value={2}>2 tags</option>
                  <option value={3}>3 tags</option>
                  <option value={4}>4 tags</option>
                  <option value={5}>5 tags</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Printer Status</label>
                <p className="text-xs text-gray-500 mb-2">Current label printer configuration</p>
                <div className="p-3 bg-gray-50 rounded-lg border">
                  {(window as any).electronPrint ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle size={16} />
                      <span className="font-bold text-sm">Desktop App Mode</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-orange-600">
                      <Info size={16} />
                      <span className="font-bold text-sm">Browser Mode - Uses Print Dialog</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Printer Selection for Electron */}
              {(window as any).electronPrint && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Select Printer</label>
                  <p className="text-xs text-gray-500 mb-2">Choose a printer for label tags (click "Detect Printers" first)</p>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 border rounded p-2"
                      value={printerSettings.printerName || ''}
                      onChange={async (e) => {
                        const name = e.target.value;
                        setPrinterSettings((prev: any) => ({ ...prev, printerName: name }));
                        if (name && (window as any).electronPrint) {
                          await (window as any).electronPrint.setPrinter(name);
                          alert('Printer set to: ' + name);
                        }
                      }}
                    >
                      <option value="">-- Select a printer --</option>
                      {printerSettings.availablePrinters?.map((p: any) => (
                        <option key={p.name} value={p.name}>{p.name} {p.isDefault ? '(Default)' : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        if ((window as any).electronPrint) {
                          const result = await (window as any).electronPrint.printTag({
                            ticketNumber: 'TEST',
                            customerName: 'Test Print',
                            customerPhone: '01onal 2345',
                            itemCount: 1,
                            items: '1x Test Item',
                            itemsSummary: '1x Test Item',
                            dueDate: new Date().toLocaleDateString('en-GB'),
                            notes: 'This is a test print',
                            orderId: 'test-' + Date.now(),
                            qrData: 'TEST-PRINT'
                          });
                          if (result.success) {
                            alert('Test tag sent to printer!');
                          } else {
                            alert('Print failed: ' + (result.error || 'Unknown error'));
                          }
                        }
                      }}
                      className="bg-pink-600 text-white px-4 py-2 rounded font-bold hover:bg-pink-700"
                    >
                      Test Print
                    </button>
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <div className="p-4 bg-pink-50 border border-pink-200 rounded-xl">
                  <h4 className="font-bold text-sm text-pink-700 mb-2 flex items-center gap-2"><Info size={14} /> How to Print Tags</h4>
                  <ul className="text-xs text-pink-800 space-y-1 list-disc list-inside">
                    <li>In the Orders tab, find the <strong>Tag</strong> button (pink printer icon) in the Actions column</li>
                    <li>Click it and enter the number of tags to print</li>
                    <li><strong>Desktop app:</strong> Click "Detect Printers" above, select your printer, then use "Test Print" to verify</li>
                    <li><strong>Browser:</strong> A print preview window will open - select your printer in the dialog</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop App Settings - Only visible in Electron */}
          {(window as any).electronApp && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  Desktop App Settings
                </h3>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold">Posso One Suite</span>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Add to Home Screen / Desktop Shortcut */}
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-800">Add to Desktop</h4>
                      <p className="text-xs text-gray-500 mb-3">Create a shortcut on your desktop for quick access</p>
                      <button
                        onClick={async () => {
                          try {
                            const result = await (window as any).electronApp.createDesktopShortcut();
                            if (result?.success !== false) {
                              alert('Desktop shortcut created successfully!');
                            } else {
                              alert('Failed to create shortcut: ' + (result?.error || 'Unknown error'));
                            }
                          } catch (e: any) {
                            alert('Error: ' + e.message);
                          }
                        }}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 transition flex items-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Add Shortcut
                      </button>
                    </div>
                  </div>
                </div>

                {/* Start on Windows Login */}
                <div className="p-4 bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl border border-cyan-100">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-cyan-100 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-600"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-800">Start on Login</h4>
                      <p className="text-xs text-gray-500 mb-3">Launch CleanPos automatically when Windows starts</p>
                      <button
                        onClick={async () => {
                          try {
                            const current = await (window as any).electronApp.getStartup();
                            const newState = !current.enabled;
                            await (window as any).electronApp.setStartup(newState);
                            alert(newState ? 'CleanPos will now start automatically with Windows!' : 'Automatic startup disabled.');
                          } catch (e: any) {
                            alert('Error: ' + e.message);
                          }
                        }}
                        className="bg-cyan-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-cyan-700 transition flex items-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        Toggle Startup
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* App Info */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 4.5C11.17 4.5 10.5 5.17 10.5 6C10.5 6.41 10.67 6.77 10.94 7.03L4.13 12.19C3.43 12.72 3 13.53 3 14.41C3 15.84 4.16 17 5.59 17H18.41C19.84 17 21 15.84 21 14.41C21 13.53 20.57 12.72 19.87 12.19L13.06 7.03C13.33 6.77 13.5 6.41 13.5 6C13.5 5.17 12.83 4.5 12 4.5Z"/><path d="M6 19H18V20H6V19Z"/></svg>
                  </div>
                  <div>
                    <span className="font-bold text-gray-800">CleanPos</span>
                    <span className="text-gray-400 mx-2">•</span>
                    <span className="text-xs text-gray-500">Posso One Suite</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400">v1.0.0</div>
              </div>
            </div>
          )}

        </div>
      )}

      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2"><ShoppingBag size={20} className="text-trust-blue" /> Order Management</h3>
              <p className="text-xs text-gray-500">Current Orders in state: {orders.length}</p>
              {fetchError && <p className="text-xs text-red-500 font-bold">Error: {fetchError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={startQRScanner} className="text-xs text-pink-700 hover:text-pink-900 bg-pink-50 hover:bg-pink-100 border border-pink-200 px-3 py-1 rounded-full font-bold flex items-center gap-1"><Search size={12} /> Scan Tag</button>
              <button onClick={processRecurringOrders} className="text-xs text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1 rounded-full font-bold flex items-center gap-1"><RefreshCw size={12} /> Process Recurring</button>
              <button onClick={fetchOrders} className="text-xs text-trust-blue hover:underline bg-blue-50 px-3 py-1 rounded-full font-bold">Refresh Orders</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200"><tr><th className="px-4 py-3">Order #</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Prefs</th><th className="px-4 py-3">POS Ticket #</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-4 font-medium text-gray-900">#{order.readable_id}</td>
                    <td className="px-4 py-4"><div className="font-bold text-gray-800">{order.customer_name}</div><div className="text-xs text-gray-500">{order.customer_address}</div></td>
                    <td className="px-4 py-4">
                      {order.preferences && Object.keys(order.preferences).length > 0 ? (
                        <div className="group relative">
                          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold cursor-help">Prefs</span>
                          <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-800 text-white text-xs p-2 rounded shadow-lg hidden group-hover:block z-50">
                            Starch: {order.preferences.starch}<br />
                            Finish: {order.preferences.finish}<br />
                            Care: {order.preferences.detergent}
                          </div>
                        </div>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-4"><div className="flex items-center gap-1"><Ticket size={14} className="text-gray-400" /><input type="text" className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:border-trust-blue outline-none" placeholder="Ticket ID" value={order.pos_ticket_id || ''} onChange={(e) => updatePosTicket(order.id, e.target.value)} /></div></td>
                    <td className="px-4 py-4"><span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
                      order.status === 'delivered' ? 'bg-teal-100 text-teal-700' :
                        order.status === 'out_for_delivery' ? 'bg-cyan-100 text-cyan-700' :
                          order.status === 'ready_for_delivery' ? 'bg-orange-100 text-orange-700' :
                            order.status === 'cleaning' ? 'bg-purple-100 text-purple-700' :
                              order.status === 'collected' ? 'bg-indigo-100 text-indigo-700' :
                                order.status === 'collection_failed' ? 'bg-red-100 text-red-700' :
                                  order.status === 'collecting' ? 'bg-blue-100 text-blue-700' :
                                    order.status === 'dispatched' ? 'bg-blue-100 text-blue-700' :
                                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-700'
                      }`}>{order.status.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-4"><select className="text-xs border border-gray-200 rounded p-1 bg-white focus:border-trust-blue outline-none" value={order.driver_id || ''} onChange={(e) => updateOrderDriver(order.id, e.target.value)}><option value="">-- Assign --</option>{drivers.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}</select></td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5 flex-wrap max-w-2xl">
                        {/* Dispatch for Collection */}
                        <button onClick={() => updateOrderStatus(order.id, 'dispatched')} title="Dispatch for Collection" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'dispatched' ? 'bg-blue-500 text-white border-blue-600 ring-2 ring-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:bg-blue-50'}`}><Truck size={14} /><span className="text-[8px] font-bold mt-0.5">Dispatch</span></button>
                        <button onClick={() => openEditOrder(order)} title="Edit Items / Add Repair" className="px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:bg-orange-50"><Edit3 size={14} /><span className="text-[8px] font-bold mt-0.5">Edit</span></button>

                        {/* Collecting */}
                        <button onClick={() => updateOrderStatus(order.id, 'collecting')} title="Collecting" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'collecting' ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:bg-blue-50'}`}><Package size={14} /><span className="text-[8px] font-bold mt-0.5">Collect</span></button>

                        {/* Collection Failed */}
                        <button onClick={() => openCollectionFailedModal(order.id)} title="Collection Failed - Customer/Order Not Ready" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'collection_failed' ? 'bg-red-600 text-white border-red-700 ring-2 ring-red-200' : 'bg-white text-gray-600 border-gray-200 hover:border-red-400 hover:bg-red-50'}`}><XCircle size={14} /><span className="text-[8px] font-bold mt-0.5">Failed</span></button>

                        {/* Collected */}
                        <button onClick={() => updateOrderStatus(order.id, 'collected')} title="Collected" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'collected' ? 'bg-indigo-600 text-white border-indigo-700 ring-2 ring-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'}`}><Check size={14} /><span className="text-[8px] font-bold mt-0.5">Collected</span></button>

                        {/* Cleaning */}
                        <button onClick={() => updateOrderStatus(order.id, 'cleaning')} title="In Cleaning" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'cleaning' ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-200' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400 hover:bg-purple-50'}`}><Shirt size={14} /><span className="text-[8px] font-bold mt-0.5">Cleaning</span></button>

                        {/* Ready for Delivery */}
                        <button onClick={() => updateOrderStatus(order.id, 'ready_for_delivery')} title="Ready for Delivery" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'ready_for_delivery' ? 'bg-orange-500 text-white border-orange-600 ring-2 ring-orange-200' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:bg-orange-50'}`}><PackageCheck size={14} /><span className="text-[8px] font-bold mt-0.5">Ready</span></button>

                        {/* Out for Delivery */}
                        <button onClick={() => updateOrderStatus(order.id, 'out_for_delivery')} title="Out for Delivery" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'out_for_delivery' ? 'bg-cyan-500 text-white border-cyan-600 ring-2 ring-cyan-200' : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-400 hover:bg-cyan-50'}`}><Truck size={14} /><span className="text-[8px] font-bold mt-0.5">Deliver</span></button>

                        {/* Delivered */}
                        <button onClick={() => updateOrderStatus(order.id, 'delivered')} title="Delivered" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'delivered' ? 'bg-teal-600 text-white border-teal-700 ring-2 ring-teal-200' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:bg-teal-50'}`}><CheckCircle size={14} /><span className="text-[8px] font-bold mt-0.5">Delivered</span></button>

                        {/* Completed */}
                        <button onClick={() => updateOrderStatus(order.id, 'completed')} title="Mark as Completed" className={`px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all ${order.status === 'completed' ? 'bg-green-600 text-white border-green-700 ring-2 ring-green-200' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:bg-green-50'}`}><CheckCircle2 size={14} /><span className="text-[8px] font-bold mt-0.5">Complete</span></button>

                        {/* Print Tag */}
                        <button onClick={() => {
                          setPrintTagOrder(order);
                          setPrintTagCount(settings.default_tag_count || 1);
                          setShowPrintTagModal(true);
                        }} title="Print Tag for Label Printer" className="px-2.5 py-2 flex flex-col items-center justify-center rounded-lg border shadow-sm transition-all bg-white text-gray-600 border-gray-200 hover:border-pink-400 hover:bg-pink-50"><Printer size={14} /><span className="text-[8px] font-bold mt-0.5">Tag</span></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 && <div className="p-8 text-center text-gray-500">No orders found.</div>}
          </div>
        </div>
      )}

      {/* Other tabs */}
      {activeTab === 'customers' && (<div className="space-y-6"><div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"><h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Users size={20} className="text-trust-blue" /> Customer Account Management</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><input type="text" placeholder="Filter by Name..." value={customerFilter.name} onChange={e => setCustomerFilter({ ...customerFilter, name: e.target.value })} className="border p-2 rounded bg-gray-50 text-sm" /><input type="text" placeholder="Filter by Phone..." value={customerFilter.phone} onChange={e => setCustomerFilter({ ...customerFilter, phone: e.target.value })} className="border p-2 rounded bg-gray-50 text-sm" /><input type="text" placeholder="Filter by Postcode..." value={customerFilter.postcode} onChange={e => setCustomerFilter({ ...customerFilter, postcode: e.target.value })} className="border p-2 rounded bg-gray-50 text-sm" /></div></div><div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center"><h4 className="font-bold text-gray-700">Customer List ({filteredCustomers.length})</h4><button onClick={fetchCustomers} className="text-xs text-trust-blue hover:underline">Refresh List</button></div><table className="w-full text-sm text-left"><thead className="text-gray-500 font-medium border-b border-gray-200"><tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Phone</th><th className="px-6 py-3">Email</th><th className="px-6 py-3">Loyalty Pts</th><th className="px-6 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredCustomers.map(customer => (<tr key={customer.id} className="hover:bg-gray-50"><td className="px-6 py-4 font-medium text-gray-900">{editingCustomer?.id === customer.id ? (<input className="border rounded p-1 w-full" value={editingCustomer.name} onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })} />) : customer.name}</td><td className="px-6 py-4 text-gray-600">{editingCustomer?.id === customer.id ? (<input className="border rounded p-1 w-full" value={editingCustomer.phone} onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })} />) : customer.phone}</td><td className="px-6 py-4 text-gray-600">{editingCustomer?.id === customer.id ? (<input className="border rounded p-1 w-full" value={editingCustomer.email} onChange={e => setEditingCustomer({ ...editingCustomer, email: e.target.value })} />) : customer.email}</td><td className="px-6 py-4"><span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-bold">{customer.loyalty_points || 0} pts</span></td><td className="px-6 py-4 text-right">{editingCustomer?.id === customer.id ? (<div className="flex justify-end gap-2"><button onClick={saveCustomer} className="text-green-600 hover:text-green-800 font-bold text-xs bg-green-50 px-3 py-1 rounded">Save</button><button onClick={() => setEditingCustomer(null)} className="text-gray-500 hover:text-gray-700 text-xs px-2">Cancel</button></div>) : (<button onClick={() => setEditingCustomer(customer)} className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs font-semibold transition"><Edit3 size={12} /> Edit</button>)}</td></tr>))}</tbody></table></div></div>)}
      {activeTab === 'corporate' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={24} className="text-trust-blue" />
              <h2 className="text-2xl font-bold">Corporate Accounts</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold text-trust-blue">{corporateAccounts.length}</div>
                <div className="text-xs text-gray-500">Active Accounts</div>
              </div>
            </div>
          </div>

          {/* Add New Corporate Account Form */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Plus size={20} className="text-trust-blue" />
              {editingCorporate ? 'Edit Corporate Account' : 'Add New Corporate Account'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company Name *</label>
                <input
                  type="text"
                  value={editingCorporate?.company_name || newCorporate.company_name}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, company_name: e.target.value}) : setNewCorporate({...newCorporate, company_name: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  placeholder="Acme Corporation"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contact Name</label>
                <input
                  type="text"
                  value={editingCorporate?.contact_name || newCorporate.contact_name}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, contact_name: e.target.value}) : setNewCorporate({...newCorporate, contact_name: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email *</label>
                <input
                  type="email"
                  value={editingCorporate?.email || newCorporate.email}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, email: e.target.value}) : setNewCorporate({...newCorporate, email: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  placeholder="accounts@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                <input
                  type="tel"
                  value={editingCorporate?.phone || newCorporate.phone}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, phone: e.target.value}) : setNewCorporate({...newCorporate, phone: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  placeholder="020 1234 5678"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Billing Address</label>
                <input
                  type="text"
                  value={editingCorporate?.address || newCorporate.address}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, address: e.target.value}) : setNewCorporate({...newCorporate, address: e.target.value})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  placeholder="123 Business Street, London, EC1A 1AA"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Discount %</label>
                <input
                  type="number"
                  value={editingCorporate?.discount_percent || newCorporate.discount_percent}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, discount_percent: parseInt(e.target.value)}) : setNewCorporate({...newCorporate, discount_percent: parseInt(e.target.value)})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  min="0"
                  max="50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payment Terms (Days)</label>
                <select
                  value={editingCorporate?.payment_terms || newCorporate.payment_terms}
                  onChange={e => editingCorporate ? setEditingCorporate({...editingCorporate, payment_terms: parseInt(e.target.value)}) : setNewCorporate({...newCorporate, payment_terms: parseInt(e.target.value)})}
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value={7}>Net 7</option>
                  <option value={14}>Net 14</option>
                  <option value={30}>Net 30</option>
                  <option value={60}>Net 60</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const data = editingCorporate || newCorporate;
                  if (!data.company_name || !data.email) {
                    alert('Company name and email are required');
                    return;
                  }
                  if (editingCorporate) {
                    // Update existing
                    const { error } = await supabase.from('cp_corporate_accounts').update(data).eq('id', editingCorporate.id);
                    if (!error) {
                      setCorporateAccounts(corporateAccounts.map(c => c.id === editingCorporate.id ? {...c, ...data} : c));
                      setEditingCorporate(null);
                    }
                  } else {
                    // Create new
                    const { data: inserted, error } = await supabase.from('cp_corporate_accounts').insert({ ...data, tenant_id: tenant.id }).select().single();
                    if (!error && inserted) {
                      setCorporateAccounts([...corporateAccounts, inserted]);
                      setNewCorporate({ company_name: '', contact_name: '', email: '', phone: '', address: '', discount_percent: 10, credit_limit: 1000, payment_terms: 30 });
                    } else {
                      // If table doesn't exist, store locally
                      const newAccount = { id: Date.now().toString(), ...data, tenant_id: tenant.id, created_at: new Date().toISOString() };
                      setCorporateAccounts([...corporateAccounts, newAccount]);
                      setNewCorporate({ company_name: '', contact_name: '', email: '', phone: '', address: '', discount_percent: 10, credit_limit: 1000, payment_terms: 30 });
                    }
                  }
                }}
                className="bg-trust-blue text-white px-6 py-2 rounded-lg font-bold hover:bg-trust-blue-hover transition flex items-center gap-2"
              >
                <Save size={16} />
                {editingCorporate ? 'Update Account' : 'Add Corporate Account'}
              </button>
              {editingCorporate && (
                <button
                  onClick={() => setEditingCorporate(null)}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Corporate Accounts List */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
              <h4 className="font-bold text-gray-700 dark:text-gray-300">Corporate Accounts ({corporateAccounts.length})</h4>
            </div>
            {corporateAccounts.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Building2 size={48} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium">No corporate accounts yet</p>
                <p className="text-sm">Add your first corporate client above to start monthly invoicing</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-gray-500 font-medium border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                  <tr>
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3">Contact</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Discount</th>
                    <th className="px-6 py-3">Terms</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {corporateAccounts.map(account => (
                    <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900 dark:text-white">{account.company_name}</div>
                        <div className="text-xs text-gray-500">{account.address}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{account.contact_name || '-'}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{account.email}</td>
                      <td className="px-6 py-4">
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full text-xs font-bold">{account.discount_percent}% off</span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">Net {account.payment_terms}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingCorporate(account)}
                            className="text-gray-400 hover:text-trust-blue p-1 transition"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Delete this corporate account?')) {
                                await supabase.from('cp_corporate_accounts').delete().eq('id', account.id);
                                setCorporateAccounts(corporateAccounts.filter(c => c.id !== account.id));
                              }
                            }}
                            className="text-gray-400 hover:text-red-500 p-1 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Benefits Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                  <FileText size={20} className="text-blue-600" />
                </div>
                <span className="font-bold text-gray-800 dark:text-white">Monthly Invoicing</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Send consolidated monthly invoices instead of charging per order</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                  <Percent size={20} className="text-green-600" />
                </div>
                <span className="font-bold text-gray-800 dark:text-white">Bulk Discounts</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Set custom discount rates for each corporate client</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                  <Users size={20} className="text-purple-600" />
                </div>
                <span className="font-bold text-gray-800 dark:text-white">Employee Allowances</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Link employees to corporate accounts for automatic billing</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'offers' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={24} className="text-trust-blue" />
            <h2 className="text-2xl font-bold">Special Offers & Promotions</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* BOGO Deal Form */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">Buy X Get Y Free</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Buy Items</label>
                  <input
                    type="number"
                    className="w-full border rounded bg-gray-50 p-2"
                    value={bogoForm.buy_qty}
                    onChange={e => setBogoForm({ ...bogoForm, buy_qty: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Get Free</label>
                  <input
                    type="number"
                    className="w-full border rounded bg-gray-50 p-2"
                    value={bogoForm.get_qty}
                    onChange={e => setBogoForm({ ...bogoForm, get_qty: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              {renderServiceSelector('bogo', bogoForm.included_items)}

              <button
                onClick={saveBogoPromotion}
                disabled={isSavingPromo}
                className="w-full bg-trust-blue text-white py-2 rounded-lg font-bold hover:bg-trust-blue-hover mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingPromo && <Loader2 size={16} className="animate-spin" />}
                {isSavingPromo ? 'Saving...' : 'Save BOGO Deal'}
              </button>

              {promotions.filter(p => p.type === 'bogo').length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-xs font-bold text-gray-500 mb-2">Active BOGO Deals</h4>
                  <div className="space-y-2">
                    {promotions.filter(p => p.type === 'bogo').map(p => (
                      <div key={p.id} className="flex justify-between items-start text-sm bg-gray-50 p-3 rounded border border-gray-100">
                        <div>
                          <div className="font-bold text-gray-800">Buy {p.buy_qty} Get {p.get_qty} Free</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Applied to: {p.included_items && p.included_items.length > 0 ? p.included_items.join(', ') : 'All Items'}
                          </div>
                        </div>
                        <button
                          onClick={() => deletePromo(p.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bundle Deal Form */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">Bundle Deal</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bundle Qty</label>
                  <input
                    type="number"
                    className="w-full border rounded bg-gray-50 p-2"
                    value={bundleForm.bundle_qty}
                    onChange={e => setBundleForm({ ...bundleForm, bundle_qty: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fixed Price (£)</label>
                  <input
                    type="number"
                    className="w-full border rounded bg-gray-50 p-2"
                    value={bundleForm.bundle_price}
                    onChange={e => setBundleForm({ ...bundleForm, bundle_price: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              {renderServiceSelector('bundle', bundleForm.included_items)}

              <button
                onClick={saveBundlePromotion}
                disabled={isSavingPromo}
                className="w-full bg-trust-blue text-white py-2 rounded-lg font-bold hover:bg-trust-blue-hover mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingPromo && <Loader2 size={16} className="animate-spin" />}
                {isSavingPromo ? 'Saving...' : 'Save Bundle'}
              </button>

              {promotions.filter(p => p.type === 'bundle').length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-xs font-bold text-gray-500 mb-2">Active Bundle Deals</h4>
                  <div className="space-y-2">
                    {promotions.filter(p => p.type === 'bundle').map(p => (
                      <div key={p.id} className="flex justify-between items-start text-sm bg-gray-50 p-3 rounded border border-gray-100">
                        <div>
                          <div className="font-bold text-gray-800">{p.bundle_qty} Items for £{p.bundle_price}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Applied to: {p.included_items && p.included_items.length > 0 ? p.included_items.join(', ') : 'All Items'}
                          </div>
                        </div>
                        <button
                          onClick={() => deletePromo(p.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Discount Codes Section */}
          <div className="my-8 border-t border-gray-200 pt-8">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Ticket size={20} className="text-trust-blue" />
              Discount Codes
            </h3>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Code</label>
                  <input type="text" placeholder="e.g. CLASS1-20" value={discountForm.code} onChange={e => setDiscountForm({ ...discountForm, code: e.target.value.toUpperCase() })} className="w-full border rounded p-2 text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Discount</label>
                  <div className="flex">
                    <input type="number" value={discountForm.discount_value} onChange={e => setDiscountForm({ ...discountForm, discount_value: parseFloat(e.target.value) })} className="w-full border rounded-l p-2 text-sm" />
                    <select value={discountForm.discount_type} onChange={e => setDiscountForm({ ...discountForm, discount_type: e.target.value })} className="border border-l-0 rounded-r bg-gray-50 p-2 text-xs font-bold">
                      <option value="percentage">%</option>
                      <option value="fixed">£</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expiry Date (Optional)</label>
                  <input type="date" value={discountForm.expiry_date} onChange={e => setDiscountForm({ ...discountForm, expiry_date: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={discountForm.one_time_use} onChange={e => setDiscountForm({ ...discountForm, one_time_use: e.target.checked })} className="w-4 h-4 text-trust-blue" />
                  <label className="text-xs font-bold text-gray-600">One-time use per customer</label>
                </div>
              </div>
              <button onClick={saveDiscountCode} disabled={isSavingPromo} className="w-full bg-trust-blue text-white py-2 rounded-lg font-bold hover:bg-trust-blue-hover text-sm flex items-center justify-center gap-2">
                {isSavingPromo && <Loader2 size={14} className="animate-spin" />}
                Save Discount Code
              </button>

              {discountCodes.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <h4 className="text-xs font-bold text-gray-500 mb-3">Active Discount Codes</h4>
                  <div className="space-y-2">
                    {discountCodes.map(c => (
                      <div key={c.id} className="flex justify-between items-center p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                        <div>
                          <span className="font-bold text-trust-blue mr-2">{c.code}</span>
                          <span className="text-gray-600">{c.discount_value}{c.discount_type === 'percentage' ? '%' : '£'} off</span>
                          {c.expiry_date && <span className="ml-2 text-red-400 text-xs">Exp: {new Date(c.expiry_date).toLocaleDateString()}</span>}
                        </div>
                        <button onClick={() => deleteDiscountCode(c.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="my-8 border-t border-gray-200 pt-8">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Gift size={20} className="text-purple-600" />
              Spend & Get Reward (Loyalty)
            </h3>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Points per £1 Spend</label>
                  <input type="number" value={settings.points_per_pound || 1} onChange={e => setSettings({ ...settings, points_per_pound: e.target.value })} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Point Value (Pence)</label>
                  <input type="number" value={settings.point_value_pence || 5} onChange={e => setSettings({ ...settings, point_value_pence: e.target.value })} className="w-full border rounded p-2" />
                  <p className="text-xs text-gray-400 mt-1">Example: 5p = 100 points is £5 off.</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Min Points to Redeem</label>
                  <input type="number" value={settings.min_points_redemption || 100} onChange={e => setSettings({ ...settings, min_points_redemption: e.target.value })} className="w-full border rounded p-2" />
                </div>
              </div>
              <div className="flex justify-end items-center gap-4">
                {saved && <span className="text-green-600 font-bold flex items-center gap-1 animate-fade-in"><Check size={16} /> Saved!</span>}
                <button
                  onClick={() => handleSaveSettings()}
                  disabled={isSavingPromo}
                  className="bg-trust-blue text-white px-6 py-2 rounded-lg font-bold hover:bg-trust-blue-hover disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingPromo && <Loader2 size={16} className="animate-spin" />}
                  Save Loyalty Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'schedule' && (<div className="space-y-6 animate-fade-in"><div className="flex items-center gap-2 mb-4"><Calendar size={24} className="text-trust-blue" /><h2 className="text-2xl font-bold">Online Order Scheduling</h2></div><div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"><div className="bg-gray-100 p-1 rounded-lg inline-flex mb-6 text-sm font-semibold text-gray-600"><div className="bg-white shadow-sm px-4 py-2 rounded text-gray-900">Collection Schedule</div><div className="px-4 py-2 opacity-50 cursor-not-allowed">Delivery Schedule</div></div><div className="space-y-4">{DAYS.map(day => { const isActive = settings[`day_active_${day}`] === 'true'; const daySlots = availableSlots.filter(s => s.day === day); return (<div key={day} className={`border rounded-xl transition-all ${isActive ? 'border-gray-300 bg-white' : 'border-gray-100 bg-gray-50'}`}><div className="flex items-center justify-between p-4"><span className={`font-bold ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>{day}</span><button onClick={() => toggleDay(day)} className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${isActive ? 'bg-trust-blue' : 'bg-gray-300'}`}><div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${isActive ? 'translate-x-6' : 'translate-x-0'}`} /></button></div>{isActive && (<div className="px-4 pb-4 border-t border-gray-100 pt-4 animate-fade-in"><div className="flex flex-wrap gap-2 mb-3">{daySlots.map(slot => (<div key={slot.id} className="bg-blue-50 text-trust-blue px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 border border-blue-100">{slot.label} - {getNextDate(slot.day)}<button onClick={() => deleteSlot(slot.id)} className="text-blue-400 hover:text-red-500 ml-2"><X size={14} /></button></div>))}{daySlots.length === 0 && <span className="text-xs text-gray-400 italic py-1">No slots added.</span>}</div><div className="flex items-center gap-2 mt-2"><input type="text" placeholder="e.g. 09:00 - 12:00" value={newSlotTimes[day] || ''} onChange={e => setNewSlotTimes({ ...newSlotTimes, [day]: e.target.value })} className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40 focus:ring-1 focus:ring-trust-blue outline-none" /><button onClick={() => addSlotToDay(day)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 transition"><Plus size={14} /> Add Time Slot</button></div></div>)}</div>); })}</div></div></div>)}

      {activeTab === 'service' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Upload size={20} className="text-trust-blue" /> Import Price List</h3>
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Upload a CSV or Excel file to bulk update products, prices, and categories.</p>
              <div className="flex justify-center gap-4">
                <label className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-trust-blue text-trust-blue px-6 py-2 rounded-lg font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 transition">
                  <Upload size={18} /> Select File (CSV/Excel)
                  <input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleFileUpload} />
                </label>
                <button onClick={() => showDeleteConfirm('all')} className="inline-flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-6 py-2 rounded-lg font-bold hover:bg-red-100 transition">
                  <Trash2 size={18} /> Clear All My Services
                </button>
              </div>
            </div>
          </div>

          {/* Category Sorting Section */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <GripVertical size={20} className="text-trust-blue" />
                Sort Service Categories
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={syncCategories}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-all"
                >
                  <RefreshCw size={16} />
                  Sync Categories
                </button>
                <button
                  onClick={() => setSortLocked(!sortLocked)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${sortLocked ? 'bg-gray-100 text-gray-600' : 'bg-trust-blue text-white shadow-md'}`}
                >
                  {sortLocked ? <Lock size={16} /> : <Unlock size={16} />}
                  {sortLocked ? 'Locked' : 'Unlocked (Sorting On)'}
                </button>
              </div>
            </div>

            {/* Category Search Filter */}
            <div className="mb-4">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-trust-blue focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                />
                {categoryFilter && (
                  <button
                    onClick={() => setCategoryFilter('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {categoryFilter && (
                <p className="text-xs text-gray-500 mt-1">
                  Showing {categories.filter(c => c.name.toLowerCase().includes(categoryFilter.toLowerCase())).length} of {categories.length} categories
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.filter(c => c.name.toLowerCase().includes(categoryFilter.toLowerCase())).map((cat, idx) => (
                <div
                  key={`${cat.name}-${idx}`}
                  draggable={!sortLocked && !editingCategory}
                  onDragStart={() => setDraggedItem(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!sortLocked && draggedItem !== null && draggedItem !== idx) {
                      e.currentTarget.classList.add('scale-105', 'ring-2', 'ring-trust-blue', 'z-10');
                    }
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('scale-105', 'ring-2', 'ring-trust-blue', 'z-10');
                  }}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove('scale-105', 'ring-2', 'ring-trust-blue', 'z-10');
                    if (draggedItem !== null) handleMoveCategory(draggedItem, idx);
                    setDraggedItem(null);
                  }}
                  className={`p-4 border-2 rounded-xl flex items-center justify-between transition-all duration-200 ${sortLocked ? 'border-gray-100 dark:border-gray-800 opacity-80' : 'border-trust-blue/20 hover:border-trust-blue/60 cursor-move bg-white dark:bg-gray-800 shadow-sm hover:shadow-md'}`}
                >
                  <div className="flex items-center gap-3 w-full">
                    {!sortLocked && <GripVertical size={20} className="text-gray-300 group-hover:text-trust-blue cursor-grab active:cursor-grabbing shrink-0" />}
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-trust-blue/60 uppercase tracking-tight">Position {idx + 1}</span>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                          {services.filter(s => s.category === cat.name).length} services
                        </span>
                      </div>
                      {editingCategory && editingCategory.originalName === cat.name ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            autoFocus
                            className="border rounded px-2 py-1 text-sm font-bold w-full dark:bg-gray-700 outline-none focus:ring-2 focus:ring-trust-blue"
                            value={editingCategory.name}
                            onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && saveCategory()}
                          />
                          <button onClick={saveCategory} className="text-green-600 hover:text-green-700 p-1"><Check size={18} /></button>
                          <button onClick={() => setEditingCategory(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
                        </div>
                      ) : (
                        <span className="font-bold text-gray-800 dark:text-gray-200 text-lg truncate">{cat.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!editingCategory && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingCategory({ ...cat, originalName: cat.name })} className="text-gray-400 hover:text-trust-blue p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg transition" title="Edit Category Name"><Edit3 size={16} /></button>
                        <button onClick={() => { console.log('Category delete clicked:', cat.name); deleteCategory(cat.name); }} className="text-gray-400 hover:text-red-500 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg transition" title="Delete Category"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Add Service Form */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Plus size={20} className="text-trust-blue" /> Add Single Service</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Category (Menu1)</label>
                <input
                  list="category-list"
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800"
                  placeholder="e.g. Alterations"
                  value={newService.category}
                  onChange={e => setNewService({ ...newService, category: e.target.value })}
                />
                <datalist id="category-list">
                  {categories.map((c, idx) => <option key={`${c.name}-${idx}`} value={c.name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Service Name</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800"
                  placeholder="e.g. Re-Hem Trousers"
                  value={newService.name}
                  onChange={e => setNewService({ ...newService, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Price (£)</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm dark:bg-gray-800"
                  placeholder="10.00"
                  value={newService.price}
                  onChange={e => setNewService({ ...newService, price: e.target.value })}
                />
              </div>
              <button
                onClick={addService}
                disabled={isAddingService}
                className="bg-trust-blue text-white py-2 px-6 rounded-lg font-bold hover:bg-trust-blue-hover transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isAddingService ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Add Service
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"><h4 className="font-bold text-gray-700 dark:text-gray-300">Current Services List</h4></div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Service Name</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {services.length === 0 && (<tr><td colSpan={4} className="p-6 text-center text-gray-500">No services found.</td></tr>)}
                  {services.map(svc => (
                    <tr key={svc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium text-gray-500">{svc.category}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                        {editingService?.id === svc.id ? (
                          <input
                            className="border rounded px-2 py-1 text-sm font-bold w-full dark:bg-gray-800"
                            value={editingService.name}
                            onChange={e => setEditingService({ ...editingService, name: e.target.value })}
                          />
                        ) : svc.name}
                      </td>
                      <td className="px-6 py-3 text-right font-bold">
                        {editingService?.id === svc.id ? (
                          <input
                            className="border rounded px-2 py-1 text-sm font-bold w-20 text-right dark:bg-gray-800"
                            value={editingService.price_numeric}
                            onChange={e => setEditingService({ ...editingService, price_numeric: e.target.value })}
                          />
                        ) : (svc.price_display || formatPrice(svc.price_numeric || svc.price || 0))}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {editingService?.id === svc.id ? (
                          <div className="flex justify-end gap-2">
                            <button onClick={saveService} className="text-green-600 hover:text-green-700 font-bold text-xs bg-green-50 px-3 py-1 rounded">Save</button>
                            <button onClick={() => setEditingService(null)} className="text-gray-500 hover:text-gray-700 text-xs px-2">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingService(svc)} className="text-gray-400 hover:text-trust-blue p-1 transition"><Edit3 size={14} /></button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('Delete clicked for:', svc.id, svc.name); deleteService(svc.id, svc.name); }} className="text-gray-400 hover:text-red-500 p-1 transition"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'marketing' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4"><Mail size={24} className="text-trust-blue" /><h2 className="text-2xl font-bold">Marketing & Promotions</h2></div>

          {/* Referral Program Section */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-green-500 p-3 rounded-xl shadow-md">
                  <Gift size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">Referral Program</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Give £5, Get £5 - Grow your business through word of mouth</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">{customers.filter(c => c.referred_by).length}</div>
                <div className="text-xs text-gray-500">Total Referrals</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Referral Reward</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">£5.00 Credit</div>
                <div className="text-xs text-gray-500">For existing customers</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">New Customer Bonus</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">£5.00 Off</div>
                <div className="text-xs text-gray-500">First order discount</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Your Referral Code</div>
                <div className="flex items-center gap-2">
                  <code className="text-lg font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">{tenant?.name?.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'REFER'}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${tenant?.name?.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'REFER'}`);
                      alert('Referral code copied!');
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-gray-700 dark:text-gray-300">Share with customers</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const msg = `Get £5 off your first order at ${tenant?.name}! Use referral code: ${tenant?.name?.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'REFER'}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold transition"
                >
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button
                  onClick={() => {
                    const subject = `Get £5 off at ${tenant?.name}`;
                    const body = `Hey! I thought you'd like this dry cleaning service. Get £5 off your first order using my referral code: ${tenant?.name?.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'REFER'}`;
                    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition"
                >
                  <Mail size={16} /> Email
                </button>
                <button
                  onClick={() => {
                    const msg = `Get £5 off your first order at ${tenant?.name}! Use code: ${tenant?.name?.replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'REFER'}`;
                    navigator.clipboard.writeText(msg);
                    alert('Message copied to clipboard!');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition"
                >
                  <Copy size={16} /> Copy Message
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Users size={20} className="text-trust-blue" /> Target Audience Segment</h3>
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  { id: 'all', label: 'All Customers', icon: Users },
                  { id: 'inactive', label: 'Inactive > 4 Weeks', icon: Clock },
                  { id: 'one-timer', label: '1-Timer Only', icon: User },
                  { id: 'laundry-only', label: 'Laundry Only', icon: Droplet },
                  { id: 'dry-cleaning-only', label: 'Dry Clean Only', icon: Shirt }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => applyMarketingFilter(f.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeFilter === f.id ? 'bg-trust-blue text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    <f.icon size={16} /> {f.label}
                  </button>
                ))}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <span className="text-blue-600 font-bold text-xl">{activeFilter === 'all' ? customers.length : marketingSegment.length}</span>
                  <span className="text-blue-800 ml-2 font-medium">Customers in selected segment</span>
                </div>
                <button onClick={() => setShowSegmentList(true)} className="text-trust-blue font-bold text-sm hover:underline">View segment list</button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Tag size={20} className="text-trust-blue" /> Create Discount Code</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Code</label>
                    <input type="text" placeholder="e.g. CLASS1-20" value={discountForm.code} onChange={e => setDiscountForm({ ...discountForm, code: e.target.value.toUpperCase() })} className="w-full border dark:border-gray-700 rounded p-2 text-sm font-bold dark:bg-gray-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Discount</label>
                    <div className="flex">
                      <input type="number" value={discountForm.discount_value} onChange={e => setDiscountForm({ ...discountForm, discount_value: parseFloat(e.target.value) })} className="w-full border dark:border-gray-700 dark:bg-gray-800 rounded-l p-2 text-sm" />
                      <select value={discountForm.discount_type} onChange={e => setDiscountForm({ ...discountForm, discount_type: e.target.value })} className="border border-l-0 dark:border-gray-700 rounded-r bg-gray-50 dark:bg-gray-700 p-2 text-xs font-bold">
                        <option value="percentage">%</option>
                        <option value="fixed">£</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Expiry Date (Optional)</label>
                    <input type="date" value={discountForm.expiry_date} onChange={e => setDiscountForm({ ...discountForm, expiry_date: e.target.value })} className="w-full border dark:border-gray-700 dark:bg-gray-800 rounded p-2 text-sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input type="checkbox" checked={discountForm.one_time_use} onChange={e => setDiscountForm({ ...discountForm, one_time_use: e.target.checked })} className="w-4 h-4 text-trust-blue rounded dark:bg-gray-800 dark:border-gray-700" />
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-400">One-time use per customer</label>
                  </div>
                </div>
                <button onClick={saveDiscountCode} disabled={isSavingPromo} className="w-full bg-trust-blue text-white py-2 rounded-lg font-bold hover:bg-trust-blue-hover text-sm flex items-center justify-center gap-2">
                  {isSavingPromo && <Loader2 size={14} className="animate-spin" />}
                  Save Discount Code
                </button>
              </div>

              {discountCodes.length > 0 && (
                <div className="mt-6 border-t dark:border-gray-800 pt-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 text-center">Active Codes</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {discountCodes.map(c => (
                      <div key={c.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 text-xs">
                        <div>
                          <span className="font-bold text-trust-blue mr-2">{c.code}</span>
                          <span className="text-gray-500 dark:text-gray-400">{c.discount_value}{c.discount_type === 'percentage' ? '%' : '£'} off</span>
                          {c.expiry_date && <span className="ml-2 text-red-400">Exp: {new Date(c.expiry_date).toLocaleDateString()}</span>}
                        </div>
                        <button onClick={() => deleteDiscountCode(c.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {showSegmentList && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                  <h3 className="font-bold text-lg">Segment Customers ({activeFilter === 'all' ? customers.length : marketingSegment.length})</h3>
                  <button onClick={() => setShowSegmentList(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0">
                      <tr>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(activeFilter === 'all' ? customers : marketingSegment).map(c => (
                        <tr key={c.id}>
                          <td className="px-4 py-2">{c.name}</td>
                          <td className="px-4 py-2">{c.email}</td>
                          <td className="px-4 py-2">{c.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-6 h-[600px]">
            <div className="w-full md:w-1/3 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800 font-bold text-gray-700 dark:text-gray-300">Templates</div>
              <div className="flex-1 overflow-y-auto">
                {emailTemplates.length === 0 && <p className="p-4 text-xs text-gray-400">No templates found. Check database.</p>}
                {emailTemplates.map(template => (
                  <div key={template.id} onClick={() => setSelectedTemplateId(template.id)} className={`p-4 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition ${selectedTemplateId === template.id ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-trust-blue' : ''}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">{template.name}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${template.type === 'marketing' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{template.type}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{template.subject}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-800">
                <button onClick={createNewTemplate} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-center gap-2">
                  <Plus size={16} /> New Template
                </button>
              </div>
            </div>

            <div className="w-full md:w-2/3 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col">
              {selectedTemplate ? (
                <>
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 mr-4">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Template Name</label>
                        <input
                          type="text"
                          value={selectedTemplate.name}
                          onChange={(e) => updateTemplate(selectedTemplate.id, 'name', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-2 text-sm font-bold focus:ring-2 focus:ring-trust-blue outline-none"
                        />
                      </div>
                      {selectedTemplate.type === 'marketing' && (
                        <button
                          onClick={handleSendCampaignClick}
                          disabled={isSendingCampaign || marketingSegment.length === 0}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm shrink-0 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSendingCampaign ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                          {isSendingCampaign ? `Sending...` : `Send Campaign (${marketingSegment.length})`}
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subject Line</label>
                        <input
                          type="text"
                          value={selectedTemplate.subject}
                          onChange={(e) => updateTemplate(selectedTemplate.id, 'subject', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-trust-blue outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase">Email Body</label>
                      <div className="flex gap-2">
                        {selectedTemplate.variables && selectedTemplate.variables.map(v => (
                          <button key={v} title="Click to copy" onClick={() => navigator.clipboard.writeText(`{{${v}}}`)} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded border border-gray-300 font-mono">{`{{${v}}}`}</button>
                        ))}
                      </div>
                    </div>
                    <textarea className="flex-1 w-full border border-gray-300 rounded-lg p-4 font-mono text-sm focus:ring-2 focus:ring-trust-blue outline-none resize-none leading-relaxed" value={selectedTemplate.body} onChange={(e) => updateTemplate(selectedTemplate.id, 'body', e.target.value)} />
                  </div>
                  <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="test@example.com"
                        value={testEmailRecipient}
                        onChange={(e) => setTestEmailRecipient(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 text-xs w-48 focus:border-trust-blue outline-none"
                      />
                      <button onClick={handleSendTestEmail} className="text-trust-blue text-sm hover:text-trust-blue-hover font-bold border border-trust-blue px-3 py-1.5 rounded bg-white">Send Test Email</button>
                    </div>
                    <button onClick={saveTemplate} className="bg-trust-blue text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-trust-blue-hover flex items-center gap-2">
                      <Save size={16} /> Save Changes
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <FileText size={48} className="mb-4 opacity-20" />
                  <p>Select a template to edit</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Truck size={24} className="text-trust-blue" />
            <h2 className="text-2xl font-bold">Driver Management</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add/Edit Driver Form */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-lg mb-4">{editingDriver ? 'Edit Driver' : 'Add New Driver'}</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Driver Name *</label>
                  <input
                    type="text"
                    value={driverForm.name}
                    onChange={e => setDriverForm({ ...driverForm, name: e.target.value })}
                    className="w-full border rounded-lg p-2"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={driverForm.email}
                    onChange={e => setDriverForm({ ...driverForm, email: e.target.value })}
                    className="w-full border rounded-lg p-2"
                    placeholder="driver@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={driverForm.phone}
                    onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })}
                    className="w-full border rounded-lg p-2"
                    placeholder="07123 456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Vehicle Registration</label>
                  <input
                    type="text"
                    value={driverForm.vehicle_reg}
                    onChange={e => setDriverForm({ ...driverForm, vehicle_reg: e.target.value.toUpperCase() })}
                    className="w-full border rounded-lg p-2 uppercase"
                    placeholder="AB12 CDE"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Password {editingDriver && '(Leave blank to keep current)'}</label>
                  <input
                    type="text"
                    value={driverForm.password_hash}
                    onChange={e => setDriverForm({ ...driverForm, password_hash: e.target.value })}
                    className="w-full border rounded-lg p-2"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Working Days</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DAYS.map(day => (
                      <button
                        key={day}
                        onClick={() => toggleDriverDay(day)}
                        className={`px-3 py-2 rounded-lg text-sm font-bold transition ${driverForm.working_days.includes(day)
                          ? 'bg-trust-blue text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                      >
                        {day.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveDriver}
                    className="flex-1 bg-trust-blue text-white py-2 rounded-lg font-bold hover:bg-trust-blue-hover"
                  >
                    {editingDriver ? 'Update Driver' : 'Add Driver'}
                  </button>
                  {editingDriver && (
                    <button
                      onClick={() => {
                        setEditingDriver(null);
                        setDriverForm({ name: '', email: '', phone: '', vehicle_reg: '', password_hash: '', working_days: [] });
                      }}
                      className="px-4 bg-gray-200 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Driver List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h4 className="font-bold text-gray-700">Active Drivers ({drivers.length})</h4>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {drivers.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Truck size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No drivers added yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {drivers.map(driver => (
                      <div key={driver.id} className="p-4 hover:bg-gray-50 transition">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h5 className="font-bold text-gray-900">{driver.name}</h5>
                            <p className="text-sm text-gray-600">{driver.email}</p>
                            {driver.phone && <p className="text-sm text-gray-600">{driver.phone}</p>}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingDriver(driver);
                                setDriverForm({
                                  name: driver.name,
                                  email: driver.email,
                                  phone: driver.phone || '',
                                  vehicle_reg: driver.vehicle_reg || '',
                                  working_days: driver.working_days || [],
                                  password_hash: ''
                                });
                              }}
                              className="text-trust-blue hover:text-trust-blue-hover p-1"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => deleteDriver(driver.id)}
                              className="text-red-400 hover:text-red-600 p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {driver.vehicle_reg && (
                          <div className="flex items-center gap-2 mt-2">
                            <Truck size={14} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {driver.vehicle_reg}
                            </span>
                          </div>
                        )}

                        {driver.working_days && driver.working_days.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {driver.working_days.map((day: string) => (
                              <span key={day} className="text-xs bg-blue-50 text-trust-blue px-2 py-0.5 rounded font-bold">
                                {day.substring(0, 3)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Route Optimization Section */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <MapPin size={20} className="text-trust-blue" />
                Route Optimization
              </h3>
              <div className="flex items-center gap-2">
                <select
                  id="route-filter"
                  className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                  defaultValue="delivery"
                >
                  <option value="collection">Collections Today</option>
                  <option value="delivery">Deliveries Today</option>
                  <option value="all">All Pending</option>
                </select>
                <button
                  onClick={() => {
                    // Get orders with addresses and sort by postcode
                    const pendingOrders = orders.filter(o =>
                      o.status === 'ready' || o.status === 'out_for_delivery' || o.status === 'pending'
                    ).filter(o => o.customer_address);

                    // Sort by postcode (extract postcode from address)
                    const sortedOrders = [...pendingOrders].sort((a, b) => {
                      const postcodeA = (a.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || '';
                      const postcodeB = (b.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || '';
                      return postcodeA.localeCompare(postcodeB);
                    });

                    // Build Google Maps directions URL
                    if (sortedOrders.length > 0) {
                      const addresses = sortedOrders.map(o => encodeURIComponent(o.customer_address)).slice(0, 10);
                      const origin = encodeURIComponent(settings.store_address || 'London');
                      const waypoints = addresses.slice(0, -1).join('|');
                      const destination = addresses[addresses.length - 1];

                      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
                      window.open(mapsUrl, '_blank');
                    } else {
                      alert('No addresses found for pending deliveries');
                    }
                  }}
                  className="bg-trust-blue text-white px-4 py-2 rounded-lg font-bold hover:bg-trust-blue-hover transition flex items-center gap-2"
                >
                  <MapPin size={16} />
                  Open in Google Maps
                </button>
              </div>
            </div>

            {/* Route List */}
            <div className="space-y-2">
              {(() => {
                const pendingOrders = orders.filter(o =>
                  (o.status === 'ready' || o.status === 'out_for_delivery' || o.status === 'pending') && o.customer_address
                );

                // Sort by postcode for optimized route
                const sortedOrders = [...pendingOrders].sort((a, b) => {
                  const postcodeA = (a.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || 'ZZZ';
                  const postcodeB = (b.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || 'ZZZ';
                  return postcodeA.localeCompare(postcodeB);
                });

                if (sortedOrders.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <Truck size={48} className="mx-auto mb-4 opacity-20" />
                      <p>No pending deliveries with addresses</p>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <Check size={16} />
                        <span className="font-bold text-sm">Route optimized by postcode - {sortedOrders.length} stops</span>
                      </div>
                    </div>

                    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold">#</th>
                            <th className="px-4 py-3 text-left font-bold">Customer</th>
                            <th className="px-4 py-3 text-left font-bold">Address</th>
                            <th className="px-4 py-3 text-left font-bold">Postcode</th>
                            <th className="px-4 py-3 text-left font-bold">Status</th>
                            <th className="px-4 py-3 text-right font-bold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {sortedOrders.map((order, idx) => {
                            const postcode = (order.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || '-';
                            return (
                              <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3">
                                  <span className="w-6 h-6 bg-trust-blue text-white rounded-full flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900 dark:text-white">{order.customer_name}</div>
                                  <div className="text-xs text-gray-500">{order.customer_phone}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                                  {order.customer_address}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded text-xs font-bold">
                                    {postcode}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                    order.status === 'ready' ? 'bg-green-100 text-green-700' :
                                    order.status === 'out_for_delivery' ? 'bg-purple-100 text-purple-700' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {order.status === 'ready' ? 'Ready' : order.status === 'out_for_delivery' ? 'Out for Delivery' : 'Pending'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => {
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer_address)}`, '_blank');
                                      }}
                                      className="text-gray-400 hover:text-trust-blue p-1"
                                      title="View on Map"
                                    >
                                      <MapPin size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        window.open(`tel:${order.customer_phone}`, '_self');
                                      }}
                                      className="text-gray-400 hover:text-green-600 p-1"
                                      title="Call Customer"
                                    >
                                      <Phone size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-4 border-t dark:border-gray-700">
                      <div className="text-sm text-gray-500">
                        Total distance will be calculated by Google Maps
                      </div>
                      <button
                        onClick={() => {
                          const sortedOrders = orders.filter(o =>
                            (o.status === 'ready' || o.status === 'out_for_delivery') && o.customer_address
                          ).sort((a, b) => {
                            const postcodeA = (a.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || '';
                            const postcodeB = (b.customer_address || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i)?.[0] || '';
                            return postcodeA.localeCompare(postcodeB);
                          });

                          // Export route as text
                          const routeText = sortedOrders.map((o, i) =>
                            `${i + 1}. ${o.customer_name}\n   ${o.customer_address}\n   Tel: ${o.customer_phone}\n`
                          ).join('\n');

                          navigator.clipboard.writeText(routeText);
                          alert('Route copied to clipboard!');
                        }}
                        className="text-sm text-trust-blue hover:text-trust-blue-hover font-bold flex items-center gap-1"
                      >
                        <Copy size={14} /> Copy Route List
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && <ReportsTab tenantId={tenant.id} />}


      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Repeat className="text-trust-blue" /> Recurring Subscriptions
              </h2>
              <p className="text-gray-500">Manage weekly and bi-weekly recurring customers</p>
            </div>
            <button
              onClick={processRecurringOrders}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold shadow-lg hover:bg-purple-700 transition flex items-center gap-2"
            >
              <Repeat size={20} /> Run Recurring Process
            </button>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <tr>
                  <th className="p-4 font-bold text-gray-500 text-sm">Customer</th>
                  <th className="p-4 font-bold text-gray-500 text-sm">Plan</th>
                  <th className="p-4 font-bold text-gray-500 text-sm">Preferred Day</th>
                  <th className="p-4 font-bold text-gray-500 text-sm">Started</th>
                  <th className="p-4 font-bold text-gray-500 text-sm">Status</th>
                  <th className="p-4 font-bold text-gray-500 text-sm">Last Order</th>
                  <th className="p-4 font-bold text-gray-500 text-sm">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {customers.filter(c => c.subscription_frequency && c.subscription_frequency !== 'none').length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-500">
                      <Repeat size={48} className="mx-auto mb-4 opacity-20" />
                      <p>No active subscriptions found.</p>
                      <p className="text-sm mt-2">Customers will appear here when they book a recurring service.</p>
                    </td>
                  </tr>
                ) : (
                  customers.filter(c => c.subscription_frequency && c.subscription_frequency !== 'none').map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-4">
                        <div className="font-bold">{customer.name}</div>
                        <div className="text-sm text-gray-500">{customer.email}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold uppercase">
                          {customer.subscription_frequency}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-bold text-trust-blue">
                        <select
                          value={customer.subscription_day || ''}
                          onChange={(e) => updateCustomerField(customer.id, 'subscription_day', e.target.value)}
                          className="bg-transparent border-0 font-bold focus:ring-0 cursor-pointer"
                        >
                          <option value="">Set Day</option>
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        <input
                          type="date"
                          value={customer.subscription_start_date || ''}
                          onChange={(e) => updateCustomerField(customer.id, 'subscription_start_date', e.target.value)}
                          className="bg-transparent border-0 text-gray-500 text-sm focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${customer.subscription_paused ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                          {customer.subscription_paused ? 'Paused' : 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        {/* Find last order date */}
                        {orders.find(o => o.customer_email === customer.email)
                          ? new Date(orders.find(o => o.customer_email === customer.email).created_at).toLocaleDateString()
                          : 'No orders yet'}
                      </td>
                      <td className="p-4">
                        {customer.subscription_paused ? (
                          <button
                            onClick={() => toggleSubscriptionPause(customer)}
                            className="px-4 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-bold border border-green-200 hover:bg-green-100 flex items-center gap-2"
                          >
                            <Play size={16} /> Resume
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleSubscriptionPause(customer)}
                            className="px-4 py-2 bg-yellow-50 text-yellow-600 rounded-lg text-sm font-bold border border-yellow-200 hover:bg-yellow-100 flex items-center gap-2"
                          >
                            <Pause size={16} /> Pause
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={24} className="text-trust-blue" />
            <h2 className="text-2xl font-bold">Subscription & Billing</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="font-bold text-lg mb-4">Plan Status</h3>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl mb-4">
                <div>
                  <p className="text-sm text-gray-500 font-bold uppercase">Current Plan</p>
                  <p className="text-xl font-bold text-trust-blue">Professional SaaS Plan</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${tenant.subscription_status === 'active' ? (tenant.pass_expires_at ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700') : 'bg-orange-100 text-orange-700'
                  }`}>
                  {tenant.pass_expires_at ? 'Partner Pass Active' : (tenant.subscription_status || 'Trialing')}
                </span>
              </div>

              {tenant.pass_expires_at && (
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-900/30 mb-6">
                  <div className="flex items-start gap-3">
                    <Zap className="text-purple-600 mt-1" size={20} />
                    <div>
                      <p className="font-bold text-purple-700">12-Month Partner Access Applied</p>
                      <p className="text-sm text-purple-100/80 dark:text-purple-300">Your account has full professional access until {new Date(tenant.pass_expires_at).toLocaleDateString()}.</p>
                    </div>
                  </div>
                </div>
              )}

              {tenant.subscription_status === 'trialing' && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/30 mb-6">
                  <div className="flex items-start gap-3">
                    <Clock className="text-trust-blue mt-1" size={20} />
                    <div>
                      <p className="font-bold text-trust-blue">Trial Ends in {Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days</p>
                      <p className="text-sm text-blue-800 dark:text-blue-300">Subscribe now to ensure uninterrupted service after your trial ends.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm font-bold p-2 border-b dark:border-gray-800">
                  <span className="text-gray-500">Monthly Amount</span>
                  <span>£65.00</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold p-2 border-b dark:border-gray-800">
                  <span className="text-gray-500">Next Billing Date</span>
                  <span>{new Date(tenant.trial_ends_at).toLocaleDateString()}</span>
                </div>
              </div>

              <button
                onClick={() => window.open('https://buy.stripe.com/6oUcN4gDh50Rc2Y60agnK0P', '_blank')}
                className="w-full mt-6 py-4 bg-trust-blue text-white rounded-xl font-bold hover:bg-trust-blue-hover transition shadow-lg flex items-center justify-center gap-2"
              >
                <ShieldCheck size={20} /> Upgrade to Professional
              </button>

              <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
                <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3">Redeem Partner Voucher</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Code"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 uppercase font-bold"
                    value={voucherCode}
                    onChange={e => setVoucherCode(e.target.value)}
                  />
                  <button
                    onClick={handleRedeemVoucher}
                    disabled={isRedeeming || !voucherCode}
                    className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black transition disabled:opacity-50"
                  >
                    {isRedeeming ? '...' : 'Redeem'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Enter your 12-month free access code here.</p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="font-bold text-lg mb-4">Usage Limits</h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-bold text-gray-600">Customers</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Unlimited</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-trust-blue h-full w-[10%]" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-bold text-gray-600">Orders (Monthly)</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Unlimited</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full w-[5%]" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-bold text-gray-600">Storage</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Unlimited</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-eco-green h-full w-[1%]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Billing Type Selection */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 md:col-span-2">
              <h3 className="font-bold text-lg mb-4">Choose Your Billing Model</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={async () => {
                    await supabase.from('tenants').update({ billing_type: 'subscription' }).eq('id', tenant.id);
                    onTenantUpdate({ ...tenant, billing_type: 'subscription' });
                  }}
                  className={`p-6 rounded-xl border-2 text-left transition ${tenant?.billing_type !== 'per_transaction' ? 'border-trust-blue bg-trust-blue/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${tenant?.billing_type !== 'per_transaction' ? 'border-trust-blue' : 'border-gray-300'}`}>
                      {tenant?.billing_type !== 'per_transaction' && <div className="w-2.5 h-2.5 rounded-full bg-trust-blue" />}
                    </div>
                    <span className="font-bold text-lg">Monthly Subscription</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Pay £65/month for unlimited orders</p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>✓ No per-transaction fees</li>
                    <li>✓ Customers can pay in store or on delivery</li>
                    <li>✓ Card payments optional</li>
                  </ul>
                </button>
                <button
                  onClick={async () => {
                    await supabase.from('tenants').update({ billing_type: 'per_transaction' }).eq('id', tenant.id);
                    onTenantUpdate({ ...tenant, billing_type: 'per_transaction' });
                  }}
                  className={`p-6 rounded-xl border-2 text-left transition ${tenant?.billing_type === 'per_transaction' ? 'border-trust-blue bg-trust-blue/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${tenant?.billing_type === 'per_transaction' ? 'border-trust-blue' : 'border-gray-300'}`}>
                      {tenant?.billing_type === 'per_transaction' && <div className="w-2.5 h-2.5 rounded-full bg-trust-blue" />}
                    </div>
                    <span className="font-bold text-lg">Pay Per Transaction</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">No monthly fee - pay only when you process orders</p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>✓ £1.20 per order (+ Stripe fees)</li>
                    <li>✓ Customers must pay by card at checkout</li>
                    <li>✓ Requires Stripe Connect setup below</li>
                  </ul>
                </button>
              </div>
            </div>

            {/* Stripe Connect Section - Only show if per_transaction billing */}
            {tenant?.billing_type === 'per_transaction' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 md:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <ShieldCheck className="text-trust-blue" /> Payments & Stripe Connect
                  </h3>
                  <p className="text-sm text-gray-500">Connect your Stripe account to process customer payments.</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${companySettings?.stripe_connect_account_id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {companySettings?.stripe_connect_account_id ? 'Connected' : 'Not Connected'}
                </div>
              </div>

              {!companySettings?.stripe_connect_account_id ? (
                <div className="bg-trust-blue/5 rounded-2xl p-8 border border-trust-blue/10 text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <CreditCard size={32} className="text-trust-blue" />
                  </div>
                  <h4 className="font-bold text-xl mb-2">Accept Online Payments</h4>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Link your Stripe account to start accepting credit card payments directly from your customer portal. We take a flat platform fee of £1.20 per transaction (plus standard Stripe fees of 1.4% + 20p).
                  </p>
                  <button
                    onClick={handleConnectStripe}
                    disabled={isConnectingStripe}
                    className="px-8 py-3 bg-[#635BFF] text-white rounded-xl font-bold hover:bg-[#5851E0] transition shadow-lg flex items-center justify-center gap-2 mx-auto"
                  >
                    {isConnectingStripe ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                    Connect with Stripe
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Account ID</p>
                    <p className="font-mono text-sm">{companySettings.stripe_connect_account_id}</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Platform Fee</p>
                    <p className="font-bold text-lg">£1.20 / order</p>
                    <p className="text-xs text-gray-500">+ Stripe fees (1.4% + 20p)</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-center">
                    <button className="text-sm font-bold text-trust-blue hover:underline">Stripe Dashboard ↗</button>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )
      }

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-8 relative transform transition-all duration-300 scale-100 border border-gray-200 dark:border-gray-800">
            <div className="absolute -top-10 left-1/2 transform -translate-x-1/2">
              <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-full p-4 shadow-lg">
                <AlertCircle size={40} className="text-white" />
              </div>
            </div>

            <div className="mt-8 text-center">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Are you sure?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {deleteConfirm.type === 'all' && (
                  <>You are about to delete <span className="font-bold text-red-600">ALL services and categories</span>. This action cannot be undone!</>
                )}
                {deleteConfirm.type === 'service' && (
                  <>You are about to delete the service <span className="font-bold text-red-600">"{deleteConfirm.name}"</span>. This cannot be undone.</>
                )}
                {deleteConfirm.type === 'category' && (
                  <>You are about to delete the category <span className="font-bold text-red-600">"{deleteConfirm.name}"</span> and all its services. This cannot be undone.</>
                )}
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-red-500/25 flex items-center gap-2"
                >
                  <Trash2 size={18} />
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How to Use Guide Modal */}
      {showHelpGuide && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-5xl w-full my-8 overflow-hidden border border-gray-200 dark:border-gray-800 animate-fade-in">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  CleanPOS User Guide
                </h2>
                <p className="text-white/80 text-sm mt-1">Complete guide to managing your dry cleaning business</p>
              </div>
              <button
                onClick={() => setShowHelpGuide(false)}
                className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all hover:rotate-90"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-10 max-h-[70vh] overflow-y-auto">

              {/* Quick Start */}
              <section className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-900/30">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                  <Rocket className="text-blue-600" size={24} /> Quick Start Guide
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center mb-2 text-blue-600 font-bold">1</div>
                    <h4 className="font-bold text-sm mb-1">Set Up Store</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Go to Store Details tab and add your business name, address, and contact info.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center mb-2 text-indigo-600 font-bold">2</div>
                    <h4 className="font-bold text-sm mb-1">Add Services</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Upload your price list CSV or manually add services in the Services tab.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center mb-2 text-purple-600 font-bold">3</div>
                    <h4 className="font-bold text-sm mb-1">Configure Schedule</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Set up your collection/delivery time slots in the Schedule tab.</p>
                  </div>
                </div>
              </section>

              {/* Orders Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <ShoppingBag className="text-trust-blue" size={20} /> Orders Management
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <p>The Orders tab is your central hub for managing all customer orders. Here's how to use it effectively:</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Viewing Orders</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• All orders are displayed with the newest first</li>
                        <li>• See order ID, customer name, status, and total</li>
                        <li>• Filter by status: Pending, Collected, Processing, Ready, Delivered</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Updating Orders</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Click dropdown to change order status</li>
                        <li>• Assign drivers for collection/delivery</li>
                        <li>• Add POS ticket ID for integration</li>
                        <li>• Click "Edit" to modify items and add charges</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Printing Invoices</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Click the printer icon on any order</li>
                        <li>• Invoice opens in new window with auto-print</li>
                        <li>• Shows all items, preferences, and totals</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Order Status Flow</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">Pending:</span> New order awaiting pickup</li>
                        <li>• <span className="font-bold">Collected:</span> Items picked up from customer</li>
                        <li>• <span className="font-bold">Processing:</span> Being cleaned/pressed</li>
                        <li>• <span className="font-bold">Ready:</span> Complete, awaiting delivery</li>
                        <li>• <span className="font-bold">Delivered:</span> Returned to customer</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Store Details Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Settings className="text-trust-blue" size={20} /> Store Details
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Invoice Settings</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">Store Name:</span> Appears on all invoices</li>
                        <li>• <span className="font-bold">VAT Number:</span> Shown if entered</li>
                        <li>• <span className="font-bold">Email:</span> Receives order notification copies</li>
                        <li>• <span className="font-bold">Phone:</span> Customer contact number</li>
                        <li>• <span className="font-bold">Address:</span> Full business address</li>
                        <li>• <span className="font-bold">Invoice Footer:</span> Custom thank-you message</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Branding & Theme</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">Header Color:</span> Top navigation bar color</li>
                        <li>• <span className="font-bold">Footer Color:</span> Bottom section color</li>
                        <li>• Use color picker or enter hex codes</li>
                        <li>• Changes apply instantly to customer site</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl md:col-span-2">
                      <h4 className="font-bold text-green-600 mb-2">SEO & Social Media</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">SEO Title:</span> Google search result title</li>
                        <li>• <span className="font-bold">Meta Description:</span> Search result description</li>
                        <li>• <span className="font-bold">Keywords:</span> Help with local search ranking</li>
                        <li>• <span className="font-bold">Facebook/Instagram:</span> Links shown in footer</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Customers Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Users className="text-trust-blue" size={20} /> Customer Management
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Customer Database</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• View all registered customers</li>
                        <li>• Search by name, phone, or postcode</li>
                        <li>• See loyalty points balance</li>
                        <li>• View order history and preferences</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Customer Preferences</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">Starch Level:</span> None, Light, Medium, Heavy</li>
                        <li>• <span className="font-bold">Finish Style:</span> On Hanger or Folded</li>
                        <li>• <span className="font-bold">Trouser Crease:</span> Natural or No Crease</li>
                        <li>• <span className="font-bold">Detergent:</span> Standard or Sensitive</li>
                        <li>• <span className="font-bold">Eco Options:</span> No plastic, recycle hangers</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl md:col-span-2">
                      <h4 className="font-bold text-orange-600 mb-2">Editing Customers</h4>
                      <p className="text-xs">Click the edit icon next to any customer to update their details, adjust loyalty points, or modify their cleaning preferences. All changes save automatically.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Subscriptions Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Repeat className="text-trust-blue" size={20} /> Subscriptions
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <p>Manage recurring customers who want regular weekly or bi-weekly pickups.</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Subscription Types</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">Weekly:</span> Pickup every 7 days</li>
                        <li>• <span className="font-bold">Bi-Weekly:</span> Pickup every 14 days</li>
                        <li>• Customers set preferred day of week</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Managing Subscriptions</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• View active vs paused subscriptions</li>
                        <li>• Pause/resume with one click</li>
                        <li>• "Process Recurring" creates pending orders</li>
                        <li>• Orders auto-clone from last pickup</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Offers & Loyalty Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Tag className="text-trust-blue" size={20} /> Offers & Loyalty
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-purple-600 mb-2">Loyalty Points</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Set points per pound spent</li>
                        <li>• Configure point value in pounds</li>
                        <li>• Customers can redeem at checkout</li>
                        <li>• Points shown on invoices</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-green-600 mb-2">BOGO Promotions</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Buy X, Get Y Free deals</li>
                        <li>• Example: Buy 3 shirts, get 1 free</li>
                        <li>• Select which items qualify</li>
                        <li>• Toggle promotions on/off</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-orange-600 mb-2">Bundle Deals</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Fixed price for X items</li>
                        <li>• Example: 5 items for £20</li>
                        <li>• Select qualifying items</li>
                        <li>• Great for shirt bundles</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl md:col-span-3">
                      <h4 className="font-bold text-trust-blue mb-2">Discount Codes</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Create unique promo codes (e.g., SAVE10)</li>
                        <li>• Set percentage or fixed amount discounts</li>
                        <li>• Configure one-time use or unlimited</li>
                        <li>• Set expiry dates for limited campaigns</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Schedule Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Clock className="text-trust-blue" size={20} /> Schedule Management
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Active Days</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Toggle each day on/off</li>
                        <li>• Inactive days hidden from booking</li>
                        <li>• Perfect for closed days (Sunday)</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Time Slots</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Add slots per day (e.g., "08:00-12:00")</li>
                        <li>• Delete slots no longer needed</li>
                        <li>• Customers select from available slots</li>
                        <li>• Slots shown in booking page</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Services Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Shirt className="text-trust-blue" size={20} /> Services & Pricing
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Adding Services</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Enter category, name, and price</li>
                        <li>• Categories organize your menu</li>
                        <li>• Prices shown to customers</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">CSV Upload</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Bulk import via CSV file</li>
                        <li>• Format: Category, Name, Price</li>
                        <li>• Or: Menu1, Menu2, Title, Price</li>
                        <li>• Click "Upload CSV" button</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Editing Services</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Click pencil icon to edit</li>
                        <li>• Update name or price</li>
                        <li>• Save changes instantly</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-red-600 mb-2">Deleting Services</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Click trash icon</li>
                        <li>• Type "DELETE" to confirm</li>
                        <li>• Action cannot be undone</li>
                      </ul>
                    </div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-900/30">
                    <h4 className="font-bold text-amber-700 mb-1 flex items-center gap-2"><AlertCircle size={16} /> Category Ordering</h4>
                    <p className="text-xs text-amber-600">Unlock sort mode (toggle at top) to drag and reorder categories. Categories appear in this order on your customer booking page.</p>
                  </div>
                </div>
              </section>

              {/* Marketing Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Mail className="text-trust-blue" size={20} /> Marketing & Email
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Email Templates</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Create custom email templates</li>
                        <li>• Edit subject and body text</li>
                        <li>• Use variables: {'{name}'}, {'{orderId}'}</li>
                        <li>• Send test emails to verify</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Customer Segments</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• <span className="font-bold">All:</span> Every customer</li>
                        <li>• <span className="font-bold">Inactive:</span> No orders in 4 weeks</li>
                        <li>• <span className="font-bold">One-timer:</span> Only 1 order ever</li>
                        <li>• <span className="font-bold">Service-specific:</span> By service type</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Drivers Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Truck className="text-trust-blue" size={20} /> Driver Management
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Adding Drivers</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Enter name, email, phone</li>
                        <li>• Set login password</li>
                        <li>• Add vehicle registration</li>
                        <li>• Select working days</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Driver Portal</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Drivers log in from footer link</li>
                        <li>• See assigned collections/deliveries</li>
                        <li>• Update order status on the go</li>
                        <li>• View customer addresses and notes</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Reports Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <TrendingUp className="text-trust-blue" size={20} /> Reports & Analytics
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Revenue Reports</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Daily, weekly, monthly revenue</li>
                        <li>• Compare to previous periods</li>
                        <li>• See growth percentage</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Order Analytics</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Total orders count</li>
                        <li>• Average order value</li>
                        <li>• Popular services</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Customer Insights</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• New vs returning</li>
                        <li>• Customer lifetime value</li>
                        <li>• Peak hours heatmap</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Billing Tab */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <CreditCard className="text-trust-blue" size={20} /> Subscription & Billing
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Plan Status</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• View current plan and status</li>
                        <li>• See trial/subscription end date</li>
                        <li>• Upgrade to Professional plan</li>
                        <li>• Redeem partner voucher codes</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-purple-600 mb-2">Stripe Connect</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Connect your Stripe account</li>
                        <li>• Accept online payments</li>
                        <li>• £1.00 platform fee per order</li>
                        <li>• Funds go directly to your account</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Customer Features */}
              <section className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-6 border border-green-100 dark:border-green-900/30">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                  <Globe className="text-green-600" size={24} /> Customer-Facing Website
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Your customers access your branded website at <span className="font-mono font-bold">{tenant?.subdomain || 'yourstore'}.cleanpos.app</span></p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <h4 className="font-bold text-sm mb-1 flex items-center gap-2"><Calendar size={16} className="text-green-600" /> Book Collection</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Customers can browse services, add items to cart, and schedule pickup times online.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <h4 className="font-bold text-sm mb-1 flex items-center gap-2"><Search size={16} className="text-green-600" /> Track Order</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Customers enter order ID to see real-time status and estimated delivery.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <h4 className="font-bold text-sm mb-1 flex items-center gap-2"><User size={16} className="text-green-600" /> My Account</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Registered customers view order history, points balance, and manage preferences.</p>
                  </div>
                </div>
              </section>

              {/* Tips */}
              <section className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-6 border border-amber-100 dark:border-amber-900/30">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                  <Sparkles className="text-amber-600" size={24} /> Pro Tips
                </h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-amber-700 dark:text-amber-200 text-xs font-bold shrink-0">1</div>
                    <p className="text-gray-700 dark:text-gray-300"><span className="font-bold">Dark Mode:</span> Click the sun/moon icon to toggle dark mode for comfortable night use.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-amber-700 dark:text-amber-200 text-xs font-bold shrink-0">2</div>
                    <p className="text-gray-700 dark:text-gray-300"><span className="font-bold">Real-time Updates:</span> Orders update automatically - no need to refresh the page.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-amber-700 dark:text-amber-200 text-xs font-bold shrink-0">3</div>
                    <p className="text-gray-700 dark:text-gray-300"><span className="font-bold">Mobile Friendly:</span> Back office works great on tablets and phones too.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center text-amber-700 dark:text-amber-200 text-xs font-bold shrink-0">4</div>
                    <p className="text-gray-700 dark:text-gray-300"><span className="font-bold">CSV Format:</span> Export your existing POS price list to CSV for quick import.</p>
                  </div>
                </div>
              </section>

              {/* Corporate Accounts */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Building2 className="text-trust-blue" size={20} /> Corporate Accounts
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <p>Manage business clients with monthly invoicing and bulk discounts.</p>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Adding Accounts</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Company name and contact</li>
                        <li>• Billing email and address</li>
                        <li>• Custom discount percentage</li>
                        <li>• Payment terms (Net 7/14/30/60)</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-green-600 mb-2">Benefits</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Monthly consolidated invoicing</li>
                        <li>• Automatic bulk discounts</li>
                        <li>• Employee allowances</li>
                        <li>• Credit limit management</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-purple-600 mb-2">Linking Employees</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Employees book under company</li>
                        <li>• Orders billed to corporate</li>
                        <li>• Track per-employee usage</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Referral Program */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Heart className="text-trust-blue" size={20} /> Referral Program
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <p>Grow your business through word of mouth with "Give £5, Get £5" referrals.</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-200 dark:border-green-800">
                      <h4 className="font-bold text-green-700 dark:text-green-400 mb-2">For Customers</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Each customer gets unique referral code</li>
                        <li>• Share via WhatsApp, Email, or copy</li>
                        <li>• Appears in basket when logged in</li>
                        <li>• Earn £5 credit for each referral</li>
                      </ul>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                      <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-2">For Business</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Track total referrals in Marketing tab</li>
                        <li>• Share store code via WhatsApp/Email</li>
                        <li>• New customers get £5 off first order</li>
                        <li>• Low cost acquisition channel</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Route Optimization */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <MapPin className="text-trust-blue" size={20} /> Route Optimization
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <p>Optimize delivery routes to save time and fuel.</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Smart Sorting</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Auto-sorts deliveries by postcode</li>
                        <li>• Groups nearby addresses together</li>
                        <li>• Shows stop number in sequence</li>
                        <li>• Filter by collections or deliveries</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Google Maps Integration</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• One-click open full route in Maps</li>
                        <li>• Click any address to view location</li>
                        <li>• Copy route list to clipboard</li>
                        <li>• Click-to-call customer numbers</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Customer Features */}
              <section>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                  <Search className="text-trust-blue" size={20} /> Customer Booking Features
                </h3>
                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                  <p>New features to improve customer booking experience.</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Service Search</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Search bar to find services quickly</li>
                        <li>• Search by name or category</li>
                        <li>• Auto-expands matching categories</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-trust-blue mb-2">Quick Add (+/-)</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Quantity buttons on each service</li>
                        <li>• Quickly add multiple of same item</li>
                        <li>• Shows current quantity in cart</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-orange-600 mb-2">Order Again</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Shows frequently ordered items</li>
                        <li>• One-click to add to cart</li>
                        <li>• Based on customer's order history</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                      <h4 className="font-bold text-purple-600 mb-2">Category Icons</h4>
                      <ul className="space-y-1 text-xs">
                        <li>• Visual icons for each category</li>
                        <li>• Auto-assigned based on name</li>
                        <li>• Shirts 👔, Dresses 👗, Coats 🧥, etc.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Support */}
              <section className="text-center py-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">Need more help? Contact support at <span className="font-bold text-trust-blue">support@posso.co.uk</span></p>
              </section>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <p className="text-xs text-gray-500">CleanPOS v2.0 - User Guide</p>
              <button
                onClick={() => setShowHelpGuide(false)}
                className="bg-trust-blue text-white px-6 py-2 rounded-xl font-bold hover:bg-trust-blue-hover transition"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Expiry Overlay */}
      {
        tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date() && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 text-center">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-trust-blue animate-fade-in shadow-trust-blue/20">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={40} className="text-trust-blue" />
              </div>
              <h2 className="text-2xl font-bold mb-4 dark:text-white">Subscription Expired</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Your trial or monthly license has ended. To continue using CleanPOS and access your dashboard, please subscribe to a plan or enter your partner voucher code below.
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => window.open('https://buy.stripe.com/6oUcN4gDh50Rc2Y60agnK0P', '_blank')}
                  className="w-full py-4 bg-trust-blue text-white rounded-xl font-bold hover:bg-trust-blue-hover transition shadow-lg flex items-center justify-center gap-2"
                >
                  Subscribe Now (£65/mo)
                </button>

                <div className="pt-6 border-t border-gray-100 dark:border-gray-800 text-left">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-2">Partner Voucher</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter Code"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 uppercase font-bold"
                      value={voucherCode}
                      onChange={e => setVoucherCode(e.target.value)}
                    />
                    <button
                      onClick={handleRedeemVoucher}
                      className="bg-gray-900 dark:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black transition"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                <button
                  onClick={onLogout}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-bold block mx-auto mt-4 text-sm"
                >
                  Switch Account / Logout
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Campaign Confirmation Modal */}
      {confirmCampaignModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 transform animate-bounce-in">
            {/* Header with icon */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <Send className="text-white" size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-800">Ready to Launch?</h3>
                <p className="text-sm text-gray-500">Your campaign is about to go live!</p>
              </div>
            </div>

            {/* Campaign details */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 mb-4 border border-purple-100">
              <div className="flex items-center gap-2 mb-2">
                <Mail size={16} className="text-purple-600" />
                <span className="font-bold text-purple-800">{selectedTemplate.name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Users size={14} className="text-pink-600" />
                  <span className="font-bold text-pink-700">{marketingSegment.length}</span>
                  <span className="text-gray-600">recipients</span>
                </div>
              </div>
            </div>

            {/* Warning/Info message */}
            <div className="flex items-start gap-2 text-sm text-gray-600 mb-6 bg-amber-50 rounded-lg p-3 border border-amber-200">
              <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <span>Emails will be sent immediately. Make sure your template is ready!</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCampaignModal(false)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSendCampaign}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Rocket size={18} />
                Send Now!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Celebration Popup for Marketing Campaign Success */}
      {celebrationPopup?.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 text-center transform animate-bounce-in relative overflow-hidden">
            {/* Confetti/sparkle background effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full opacity-20 blur-xl animate-pulse"></div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full opacity-20 blur-xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full opacity-15 blur-lg animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            {/* Trophy/Star Icon */}
            <div className="relative mb-6">
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full mx-auto flex items-center justify-center shadow-lg animate-pulse">
                <span className="text-5xl">&#127942;</span>
              </div>
              <div className="absolute -top-2 -right-8 text-3xl animate-bounce" style={{ animationDelay: '0.2s' }}>&#10024;</div>
              <div className="absolute -top-1 -left-6 text-2xl animate-bounce" style={{ animationDelay: '0.4s' }}>&#11088;</div>
              <div className="absolute -bottom-2 right-4 text-2xl animate-bounce" style={{ animationDelay: '0.6s' }}>&#127775;</div>
            </div>

            {/* Main Message */}
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 mb-2 relative">
              You're a Marketing GURU!
            </h2>
            <p className="text-xl font-bold text-gray-700 mb-4">That was Genius Marketing!</p>

            {/* Stats */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 mb-6 border border-green-200">
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <div className="text-4xl font-black text-green-600">{celebrationPopup.successCount}</div>
                  <div className="text-sm font-bold text-green-700 uppercase tracking-wide">Sent</div>
                </div>
                {celebrationPopup.failCount > 0 && (
                  <div className="text-center">
                    <div className="text-4xl font-black text-orange-500">{celebrationPopup.failCount}</div>
                    <div className="text-sm font-bold text-orange-600 uppercase tracking-wide">Skipped</div>
                  </div>
                )}
              </div>
            </div>

            {/* Motivational subtext */}
            <p className="text-gray-500 text-sm mb-6">
              {celebrationPopup.successCount > 10
                ? "Wow! That's some serious reach! Your customers are going to love this!"
                : celebrationPopup.successCount > 5
                  ? "Great work! Your marketing game is on point!"
                  : "Every email counts! Keep building those relationships!"}
            </p>

            {/* Close button */}
            <button
              onClick={() => setCelebrationPopup(null)}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-8 rounded-full text-lg shadow-lg transform hover:scale-105 transition-all duration-200"
            >
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={stopQRScanner} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Search className="text-pink-600" size={24} />
              Scan Order Tag
            </h3>
            <p className="text-sm text-gray-500 mb-4">Point your camera at the QR code on the tag</p>

            <div className="relative bg-black rounded-xl overflow-hidden mb-4" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-pink-500 rounded-2xl opacity-50"></div>
              </div>
            </div>

            <div className="text-center text-sm text-gray-500 mb-4">— or enter order ID manually —</div>

            <button
              onClick={() => { setShowTouchKeypad(true); setTouchKeypadValue(''); }}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:from-pink-700 hover:to-purple-700 flex items-center justify-center gap-3"
            >
              <Hash size={24} />
              Enter Tag Code
            </button>
          </div>
        </div>
      )}

      {/* Touch Keypad Modal for Tag Entry */}
      {showTouchKeypad && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-pink-600 to-purple-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Hash size={24} />
                Enter Tag Code
              </h3>
              <button onClick={() => setShowTouchKeypad(false)} className="text-white/80 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="p-4">
              {/* Display */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 mb-4 min-h-[60px] flex items-center justify-center">
                <span className="text-3xl font-mono font-bold tracking-widest text-gray-800 dark:text-white">
                  {touchKeypadValue || '—'}
                </span>
              </div>

              {/* Alphanumeric Keypad */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((key) => (
                  <button
                    key={key}
                    onClick={() => setTouchKeypadValue(prev => prev + key)}
                    className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-2xl font-bold py-4 rounded-xl transition-colors"
                  >
                    {key}
                  </button>
                ))}
                <button
                  onClick={() => setTouchKeypadValue(prev => prev.slice(0, -1))}
                  className="bg-orange-100 dark:bg-orange-900 hover:bg-orange-200 dark:hover:bg-orange-800 text-orange-600 dark:text-orange-300 text-xl font-bold py-4 rounded-xl transition-colors flex items-center justify-center"
                >
                  <Delete size={28} />
                </button>
              </div>

              {/* Letter Row for Order IDs like ABC123 */}
              <div className="grid grid-cols-6 gap-1 mb-4">
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map((key) => (
                  <button
                    key={key}
                    onClick={() => setTouchKeypadValue(prev => prev + key)}
                    className="bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 text-lg font-bold py-3 rounded-lg transition-colors"
                  >
                    {key}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setTouchKeypadValue(''); }}
                  className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 py-4 rounded-xl font-bold text-lg hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    if (touchKeypadValue.trim()) {
                      handleManualOrderIdEntry(touchKeypadValue.trim());
                      setShowTouchKeypad(false);
                      setTouchKeypadValue('');
                    }
                  }}
                  className="flex-1 bg-gradient-to-r from-pink-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:from-pink-700 hover:to-purple-700 flex items-center justify-center gap-2"
                >
                  <Search size={20} />
                  Find Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scanned Order Modal */}
      {showScannedOrderModal && scannedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-pink-600 to-purple-600 text-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold">Order #{scannedOrder.readable_id || scannedOrder.pos_ticket_id || scannedOrder.id?.slice(-6)?.toUpperCase()}</h3>
                  <p className="text-pink-100 text-sm mt-1">{scannedOrder.customer_name || 'Walk-in Customer'}</p>
                </div>
                <button onClick={() => { setShowScannedOrderModal(false); setScannedOrder(null); }} className="text-white/80 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Customer</label>
                  <p className="font-semibold">{scannedOrder.customer_name || 'Walk-in'}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                  <p className="font-semibold">{scannedOrder.customer_phone || '-'}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Address</label>
                  <p className="font-semibold">{scannedOrder.customer_address || '-'}</p>
                </div>
              </div>

              {/* Order Items */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Items</label>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                  {(() => {
                    let items: any[] = [];
                    try {
                      items = typeof scannedOrder.items === 'string' ? JSON.parse(scannedOrder.items) : scannedOrder.items || [];
                    } catch (e) { items = []; }
                    return items.length > 0 ? items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                        <span className="font-medium">{item.quantity || 1}x {item.item_name || item.name || item.service_name || 'Item'}</span>
                        <span className="text-gray-600">£{((item.unit_price || item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                      </div>
                    )) : <p className="text-gray-400">No items</p>;
                  })()}
                </div>
              </div>

              {/* Status & POS Ticket */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase inline-block ${
                    scannedOrder.status === 'completed' ? 'bg-green-100 text-green-700' :
                    scannedOrder.status === 'cleaning' ? 'bg-purple-100 text-purple-700' :
                    scannedOrder.status === 'collected' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{scannedOrder.status?.replace(/_/g, ' ') || 'pending'}</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">POS Ticket #</label>
                  <input
                    type="text"
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={scannedOrder.pos_ticket_id || ''}
                    onChange={(e) => setScannedOrder({ ...scannedOrder, pos_ticket_id: e.target.value })}
                    placeholder="Enter ticket ID"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm"
                  rows={2}
                  value={scannedOrder.notes || ''}
                  onChange={(e) => setScannedOrder({ ...scannedOrder, notes: e.target.value })}
                  placeholder="Add notes..."
                />
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { updateOrderStatus(scannedOrder.id, 'collected'); setScannedOrder({ ...scannedOrder, status: 'collected' }); }} className="flex-1 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-sm hover:bg-indigo-200">Collected</button>
                <button onClick={() => { updateOrderStatus(scannedOrder.id, 'cleaning'); setScannedOrder({ ...scannedOrder, status: 'cleaning' }); }} className="flex-1 py-2 bg-purple-100 text-purple-700 rounded-lg font-bold text-sm hover:bg-purple-200">Cleaning</button>
                <button onClick={() => { updateOrderStatus(scannedOrder.id, 'ready_for_delivery'); setScannedOrder({ ...scannedOrder, status: 'ready_for_delivery' }); }} className="flex-1 py-2 bg-orange-100 text-orange-700 rounded-lg font-bold text-sm hover:bg-orange-200">Ready</button>
                <button onClick={() => { updateOrderStatus(scannedOrder.id, 'completed'); setScannedOrder({ ...scannedOrder, status: 'completed' }); }} className="flex-1 py-2 bg-green-100 text-green-700 rounded-lg font-bold text-sm hover:bg-green-200">Complete</button>
              </div>
            </div>

            <div className="border-t p-4 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
              <button
                onClick={() => printOrderTag(scannedOrder)}
                className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-pink-700"
              >
                <Printer size={16} /> Print Tag
              </button>
              <button
                onClick={async () => {
                  await supabase.from('cp_orders').update({
                    pos_ticket_id: scannedOrder.pos_ticket_id,
                    notes: scannedOrder.notes
                  }).eq('id', scannedOrder.id);
                  setShowScannedOrderModal(false);
                  setScannedOrder(null);
                  fetchOrders();
                }}
                className="bg-trust-blue text-white px-6 py-2 rounded-lg font-bold hover:bg-trust-blue-hover"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fancy Print Notification Pop-up */}
      {printToast.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
          <div className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden transform animate-scale-in`}>
            {/* Animated gradient header */}
            <div className={`h-2 ${
              printToast.type === 'success' ? 'bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500' :
              printToast.type === 'error' ? 'bg-gradient-to-r from-red-400 via-rose-500 to-pink-500' :
              'bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500'
            } animate-gradient-x`} />

            <div className="p-8 text-center">
              {/* Large animated icon */}
              <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center animate-bounce-in ${
                printToast.type === 'success' ? 'bg-gradient-to-br from-green-100 to-emerald-200 dark:from-green-900/30 dark:to-emerald-800/30' :
                printToast.type === 'error' ? 'bg-gradient-to-br from-red-100 to-rose-200 dark:from-red-900/30 dark:to-rose-800/30' :
                'bg-gradient-to-br from-yellow-100 to-amber-200 dark:from-yellow-900/30 dark:to-amber-800/30'
              }`}>
                {printToast.type === 'success' ? (
                  <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
                ) : printToast.type === 'error' ? (
                  <XCircle size={40} className="text-red-600 dark:text-red-400" />
                ) : (
                  <Info size={40} className="text-yellow-600 dark:text-yellow-400" />
                )}
              </div>

              {/* Title */}
              <h3 className={`text-2xl font-bold mb-2 ${
                printToast.type === 'success' ? 'text-green-700 dark:text-green-400' :
                printToast.type === 'error' ? 'text-red-700 dark:text-red-400' :
                'text-yellow-700 dark:text-yellow-400'
              }`}>
                {printToast.type === 'success' ? '✨ Print Success!' : printToast.type === 'error' ? '❌ Print Failed' : '⚠️ Warning'}
              </h3>

              {/* Message */}
              <p className="text-gray-600 dark:text-gray-300 mb-6">{printToast.message}</p>

              {/* Dismiss button */}
              <button
                onClick={() => setPrintToast(prev => ({ ...prev, show: false }))}
                className={`px-8 py-3 rounded-xl font-semibold text-white transition-all transform hover:scale-105 active:scale-95 shadow-lg ${
                  printToast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' :
                  printToast.type === 'error' ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700' :
                  'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700'
                }`}
              >
                Got it
              </button>
            </div>

            {/* Decorative elements */}
            <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 ${
              printToast.type === 'success' ? 'bg-green-500' :
              printToast.type === 'error' ? 'bg-red-500' :
              'bg-yellow-500'
            }`} />
            <div className={`absolute -bottom-8 -left-8 w-24 h-24 rounded-full opacity-10 ${
              printToast.type === 'success' ? 'bg-emerald-500' :
              printToast.type === 'error' ? 'bg-rose-500' :
              'bg-amber-500'
            }`} />
          </div>
        </div>
      )}

      {/* Print Tag Modal */}
      {showPrintTagModal && printTagOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/20 rounded-full flex items-center justify-center">
                <Printer size={24} className="text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Print Tags</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Order #{printTagOrder.readable_id}</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                How many tags to print?
              </label>
              <div className="flex items-center gap-4 justify-center">
                <button
                  onClick={() => setPrintTagCount(Math.max(1, printTagCount - 1))}
                  className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center text-lg font-bold hover:bg-gray-100"
                >-</button>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={printTagCount}
                  onChange={(e) => setPrintTagCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-20 text-center text-2xl font-bold border rounded-lg p-2"
                />
                <button
                  onClick={() => setPrintTagCount(Math.min(10, printTagCount + 1))}
                  className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center text-lg font-bold hover:bg-gray-100"
                >+</button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPrintTagModal(false);
                  setPrintTagOrder(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  for (let i = 0; i < printTagCount; i++) {
                    setTimeout(() => printOrderTag(printTagOrder), i * 500);
                  }
                  setShowPrintTagModal(false);
                  setPrintTagOrder(null);
                }}
                className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg font-bold hover:bg-pink-700 flex items-center justify-center gap-2"
              >
                <Printer size={16} /> Print {printTagCount} Tag{printTagCount > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {isEditOrderOpen && editingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">Edit Order</h3>
                  <p className="text-orange-100 text-sm">#{editingOrder.readable_id || editingOrder.pos_ticket_id}</p>
                </div>
                <button onClick={() => { setIsEditOrderOpen(false); setEditingOrder(null); }} className="text-white/80 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Customer Info */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="font-bold">{editingOrder.customer_name || 'Walk-in'}</p>
                <p className="text-sm text-gray-500">{editingOrder.customer_phone}</p>
              </div>

              {/* Order Items */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Items</label>
                <div className="space-y-2">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || 1}
                        onChange={(e) => {
                          const newItems = [...orderItems];
                          newItems[idx].quantity = parseInt(e.target.value) || 1;
                          setOrderItems(newItems);
                        }}
                        className="w-14 border rounded px-2 py-1 text-center text-sm"
                      />
                      <span className="flex-1 font-medium text-sm">{item.item_name || item.name || item.service_name || 'Item'}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-sm">£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price || item.price || 0}
                          onChange={(e) => {
                            const newItems = [...orderItems];
                            const newPrice = parseFloat(e.target.value) || 0;
                            newItems[idx].unit_price = newPrice;
                            newItems[idx].price = newPrice;
                            setOrderItems(newItems);
                          }}
                          className="w-20 border rounded px-2 py-1 text-right text-sm"
                        />
                      </div>
                      <button
                        onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {orderItems.length === 0 && (
                    <p className="text-gray-400 text-sm">No items</p>
                  )}
                </div>
              </div>

              {/* Add Item / Add Surcharge */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Add Service</label>
                  <select
                    onChange={(e) => {
                      const service = availableServices.find(s => s.id === e.target.value);
                      if (service) {
                        const price = service.price_numeric || service.price || 0;
                        setOrderItems([...orderItems, {
                          id: service.id,
                          item_name: service.name,
                          name: service.name,
                          quantity: 1,
                          unit_price: price,
                          price: price
                        }]);
                        e.target.value = '';
                      }
                    }}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">-- Select service --</option>
                    {availableServices.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - £{(s.price_numeric || 0).toFixed(2)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Custom Charge</label>
                  <button
                    onClick={() => setShowSurchargeModal(true)}
                    className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:from-purple-600 hover:to-indigo-700 flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Add Surcharge
                  </button>
                </div>
              </div>

              {/* Repair Charge */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Repair Charge (£)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={repairCharge}
                  onChange={(e) => setRepairCharge(parseFloat(e.target.value) || 0)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="0.00"
                />
              </div>

              {/* Total */}
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-700 dark:text-gray-300">New Total:</span>
                  <span className="text-2xl font-bold text-green-600">
                    £{(orderItems.reduce((sum, item) => sum + ((item.unit_price || item.price || 0) * (item.quantity || 1)), 0) + repairCharge).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t p-4 flex gap-3">
              <button
                onClick={() => { setIsEditOrderOpen(false); setEditingOrder(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await saveOrderChanges();
                  setIsEditOrderOpen(false);
                  setEditingOrder(null);
                }}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Failed Modal */}
      {showCollectionFailedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <XCircle size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Collection Failed</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Mark collection as unsuccessful</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Reason for failed collection:
              </label>
              <select
                value={collectionFailedReason}
                onChange={(e) => setCollectionFailedReason(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-2"
              >
                <option value="">-- Select reason --</option>
                <option value="Customer not available">Customer not available</option>
                <option value="Address not found">Address not found</option>
                <option value="Order not ready">Order not ready</option>
                <option value="Customer rescheduled">Customer rescheduled</option>
                <option value="Access issues">Access issues</option>
                <option value="Other">Other</option>
              </select>
              {collectionFailedReason === 'Other' && (
                <textarea
                  placeholder="Please describe the reason..."
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  onChange={(e) => setCollectionFailedReason(e.target.value)}
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCollectionFailedModal(false);
                  setCollectionFailedOrderId(null);
                  setCollectionFailedReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!collectionFailedOrderId || !collectionFailedReason) {
                    alert('Please select a reason');
                    return;
                  }
                  await supabase.from('cp_orders').update({
                    status: 'collection_failed',
                    collection_failed_reason: collectionFailedReason,
                    collection_failed_at: new Date().toISOString()
                  }).eq('id', collectionFailedOrderId);
                  setShowCollectionFailedModal(false);
                  setCollectionFailedOrderId(null);
                  setCollectionFailedReason('');
                  fetchOrders();
                }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600"
              >
                Mark as Failed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fancy Confirm Modal */}
      {fancyConfirm.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform animate-scale-in">
            {/* Header with gradient */}
            <div className={`h-2 ${
              fancyConfirm.icon === 'danger' ? 'bg-gradient-to-r from-red-500 to-rose-600' :
              fancyConfirm.icon === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-amber-600' :
              fancyConfirm.icon === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
              'bg-gradient-to-r from-blue-500 to-indigo-600'
            }`} />

            <div className="p-6">
              {/* Icon */}
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                fancyConfirm.icon === 'danger' ? 'bg-red-100 dark:bg-red-900/30' :
                fancyConfirm.icon === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                fancyConfirm.icon === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {fancyConfirm.icon === 'danger' ? (
                  <AlertCircle size={32} className="text-red-600 dark:text-red-400" />
                ) : fancyConfirm.icon === 'warning' ? (
                  <AlertCircle size={32} className="text-yellow-600 dark:text-yellow-400" />
                ) : fancyConfirm.icon === 'success' ? (
                  <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
                ) : (
                  <Info size={32} className="text-blue-600 dark:text-blue-400" />
                )}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
                {fancyConfirm.title}
              </h3>

              {/* Message */}
              <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
                {fancyConfirm.message}
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setFancyConfirm(prev => ({ ...prev, show: false }))}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  {fancyConfirm.cancelText || 'Cancel'}
                </button>
                <button
                  onClick={() => fancyConfirm.onConfirm()}
                  className={`flex-1 px-4 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105 ${
                    fancyConfirm.icon === 'danger' ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700' :
                    fancyConfirm.icon === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700' :
                    'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                  }`}
                >
                  {fancyConfirm.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fancy Alert Modal */}
      {fancyAlert.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform animate-scale-in">
            {/* Header with gradient */}
            <div className={`h-2 ${
              fancyAlert.type === 'error' ? 'bg-gradient-to-r from-red-500 to-rose-600' :
              fancyAlert.type === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-amber-600' :
              fancyAlert.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
              'bg-gradient-to-r from-blue-500 to-indigo-600'
            }`} />

            <div className="p-6 text-center">
              {/* Icon */}
              <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center animate-bounce-in ${
                fancyAlert.type === 'error' ? 'bg-gradient-to-br from-red-100 to-rose-200 dark:from-red-900/30 dark:to-rose-800/30' :
                fancyAlert.type === 'warning' ? 'bg-gradient-to-br from-yellow-100 to-amber-200 dark:from-yellow-900/30 dark:to-amber-800/30' :
                fancyAlert.type === 'success' ? 'bg-gradient-to-br from-green-100 to-emerald-200 dark:from-green-900/30 dark:to-emerald-800/30' :
                'bg-gradient-to-br from-blue-100 to-indigo-200 dark:from-blue-900/30 dark:to-indigo-800/30'
              }`}>
                {fancyAlert.type === 'error' ? (
                  <XCircle size={40} className="text-red-600 dark:text-red-400" />
                ) : fancyAlert.type === 'warning' ? (
                  <AlertCircle size={40} className="text-yellow-600 dark:text-yellow-400" />
                ) : fancyAlert.type === 'success' ? (
                  <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
                ) : (
                  <Info size={40} className="text-blue-600 dark:text-blue-400" />
                )}
              </div>

              {/* Title */}
              <h3 className={`text-2xl font-bold mb-2 ${
                fancyAlert.type === 'error' ? 'text-red-700 dark:text-red-400' :
                fancyAlert.type === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                fancyAlert.type === 'success' ? 'text-green-700 dark:text-green-400' :
                'text-blue-700 dark:text-blue-400'
              }`}>
                {fancyAlert.title}
              </h3>

              {/* Message */}
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                {fancyAlert.message}
              </p>

              {/* Dismiss Button */}
              <button
                onClick={() => setFancyAlert(prev => ({ ...prev, show: false }))}
                className={`px-8 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105 shadow-lg ${
                  fancyAlert.type === 'error' ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700' :
                  fancyAlert.type === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700' :
                  fancyAlert.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' :
                  'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                }`}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Surcharge Modal */}
      {showSurchargeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[250] p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform animate-scale-in">
            {/* Header */}
            <div className="h-2 bg-gradient-to-r from-purple-500 to-indigo-600" />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                  <Plus size={24} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Surcharge</h3>
                  <p className="text-sm text-gray-500">Add a custom charge to this order</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={surchargeDescription}
                    onChange={(e) => setSurchargeDescription(e.target.value)}
                    placeholder="e.g., Express service, Special treatment..."
                    className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 focus:border-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Amount (£)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={surchargeAmount}
                    onChange={(e) => setSurchargeAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-xl font-bold focus:border-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowSurchargeModal(false);
                    setSurchargeDescription('');
                    setSurchargeAmount('');
                  }}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addSurcharge}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-bold hover:from-purple-600 hover:to-indigo-700 flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

const BookingPage: React.FC<{
  tenant: any;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  availableSlots: TimeSlot[];
  currentUser: any;
  onLoginSuccess: (user: any) => void;
  setPage: (p: Page) => void;
  companySettings: any;
}> = ({ tenant, cart, setCart, availableSlots, currentUser, onLoginSuccess, setPage, companySettings }) => {
  const [step, setStep] = useState(1);
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [recurring, setRecurring] = useState<'none' | 'weekly' | '2weekly'>('none');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceProduct[]>([]);
  const [expandedCats, setExpandedCats] = useState<string[]>([]);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<DiscountCode | null>(null);
  const [codeError, setCodeError] = useState('');
  const [showMultiOfferWarning, setShowMultiOfferWarning] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [recentItems, setRecentItems] = useState<{name: string; price: string; count: number}[]>([]);

  // Category icons mapping
  const getCategoryIcon = (catName: string) => {
    const name = catName.toLowerCase();
    if (name.includes('shirt')) return '👔';
    if (name.includes('dress') || name.includes('ladies')) return '👗';
    if (name.includes('suit') || name.includes('mens') || name.includes('men')) return '🤵';
    if (name.includes('coat') || name.includes('jacket')) return '🧥';
    if (name.includes('trouser') || name.includes('pants')) return '👖';
    if (name.includes('laundry') || name.includes('wash')) return '🧺';
    if (name.includes('household') || name.includes('bedding') || name.includes('curtain')) return '🏠';
    if (name.includes('leather') || name.includes('suede')) return '🧳';
    if (name.includes('wedding') || name.includes('bridal')) return '💒';
    if (name.includes('alter') || name.includes('repair') || name.includes('tailor')) return '✂️';
    if (name.includes('press') || name.includes('iron')) return '♨️';
    if (name.includes('express') || name.includes('same') || name.includes('urgent')) return '⚡';
    if (name.includes('child') || name.includes('kid')) return '👶';
    if (name.includes('shoe') || name.includes('boot')) return '👞';
    if (name.includes('bag') || name.includes('handbag')) return '👜';
    if (name.includes('jumper') || name.includes('sweater') || name.includes('cardigan')) return '🧶';
    if (name.includes('rain') || name.includes('waterproof')) return '🌧️';
    if (name.includes('silk') || name.includes('delicate')) return '✨';
    if (name.includes('uniform') || name.includes('work')) return '👷';
    if (name.includes('sport') || name.includes('gym')) return '🏃';
    if (name.includes('misc') || name.includes('other')) return '📦';
    return '👕'; // Default
  };

  useEffect(() => {
    let mounted = true;
    const loadBookingData = async () => {
      try {
        const { data: cats } = await supabase.from('cp_categories').select('*').eq('tenant_id', tenant.id).order('sort_order', { ascending: true });
        if (mounted && cats) {
          setCategories(cats);
          if (cats.length > 0) setExpandedCats([cats[0].name]);
        }
        const { data: svcs } = await supabase.from('cp_services').select('*').eq('tenant_id', tenant.id).order('category');
        if (mounted && svcs) setServices(svcs);
        const { data: promos } = await supabase.from('cp_promotions').select('*').eq('tenant_id', tenant.id).eq('active', true);
        if (mounted && promos) setPromotions(promos.filter(p => p.active));

        if (currentUser) {
          setCustomer({
            name: currentUser.name || '',
            email: currentUser.email || '',
            phone: currentUser.phone || '',
            address: currentUser.address || '',
            notes: currentUser.notes || ''
          });
          if (currentUser.loyalty_points) setPointsBalance(currentUser.loyalty_points);

          // Fetch recent orders to show "Order Again" items
          const { data: recentOrders } = await supabase
            .from('cp_orders')
            .select('items')
            .eq('tenant_id', tenant.id)
            .eq('customer_email', currentUser.email)
            .order('created_at', { ascending: false })
            .limit(10);

          if (recentOrders && mounted) {
            // Extract and count items from recent orders
            const itemCounts: Record<string, {name: string; price: string; count: number}> = {};
            recentOrders.forEach(order => {
              try {
                const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                if (Array.isArray(items)) {
                  items.forEach((item: any) => {
                    if (item.name && !item.name.includes('Valet Bag')) {
                      if (!itemCounts[item.name]) {
                        itemCounts[item.name] = { name: item.name, price: item.price || '0', count: 0 };
                      }
                      itemCounts[item.name].count += item.quantity || 1;
                    }
                  });
                }
              } catch (e) { /* ignore parse errors */ }
            });
            // Sort by frequency and take top 6
            const sortedItems = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 6);
            setRecentItems(sortedItems);
          }
        }
      } catch (err) {
        console.error('Error loading booking data:', err);
      } finally {
        if (mounted) setDataLoading(false);
      }
    };
    loadBookingData();
    return () => { mounted = false; };
  }, [tenant, currentUser]);

  // Effect to auto-set recurring if Valet Bag is in cart
  useEffect(() => {
    const weeklyItem = cart.find(i => i.name.toLowerCase().includes('weekly valet') && !i.name.toLowerCase().includes('bi'));
    const biWeeklyItem = cart.find(i => i.name.toLowerCase().includes('bi-weekly valet'));

    if (weeklyItem) {
      if (recurring !== 'weekly') setRecurring('weekly');
    } else if (biWeeklyItem) {
      if (recurring !== '2weekly') setRecurring('2weekly');
    }
  }, [cart]);

  const calculateTotals = () => {
    let subtotal = 0; let discount = 0; const pointsPerPound = 5; const pointValuePence = 5;
    let appliedPromotion: Promotion | null = null;

    cart.forEach(item => { const price = parseFloat(item.price); if (!isNaN(price)) { subtotal += price * item.quantity; } });

    // Only apply promotions if NO discount code is active
    if (!appliedDiscountCode) {
      // Only apply ONE promotion (the first one that qualifies)
      for (const promo of promotions) {
        const eligibleItems = cart.filter(cartItem => promo.included_items && promo.included_items.includes(cartItem.name));
        if (eligibleItems.length === 0) continue;

        let itemsPool: { price: number }[] = [];
        eligibleItems.forEach(item => { for (let i = 0; i < item.quantity; i++) itemsPool.push({ price: parseFloat(item.price) }); });

        let promoDiscount = 0;

        if (promo.type === 'bogo') {
          // Buy X Get Y Free means: for every X items purchased, Y items are free
          // Example: Buy 3 Get 1 Free = every 3 items purchased, 1 is free (need 3 items minimum)
          const buyQty = promo.buy_qty;
          const freeQty = promo.get_qty;
          const totalItems = itemsPool.length;

          // Calculate how many complete sets we have (each set = buyQty items)
          const numSets = Math.floor(totalItems / buyQty);

          if (numSets > 0) {
            // Sort by price ascending (cheapest first)
            itemsPool.sort((a, b) => a.price - b.price);

            // Give away the cheapest items (up to freeQty per set)
            const totalFreeItems = Math.min(numSets * freeQty, totalItems);
            for (let i = 0; i < totalFreeItems; i++) {
              promoDiscount += itemsPool[i].price;
            }
          }
        } else if (promo.type === 'bundle') {
          const bundleQty = promo.bundle_qty;
          const totalItems = itemsPool.length;
          const numBundles = Math.floor(totalItems / bundleQty);
          if (numBundles > 0) {
            itemsPool.sort((a, b) => b.price - a.price);
            let standardPriceForBundledItems = 0;
            const bundledItemsCount = numBundles * bundleQty;
            for (let i = 0; i < bundledItemsCount; i++) {
              standardPriceForBundledItems += itemsPool[i].price;
            }
            const bundleCost = numBundles * promo.bundle_price;
            const saving = standardPriceForBundledItems - bundleCost;
            if (saving > 0) promoDiscount = saving;
          }
        }

        // If this promotion gives a discount, apply it and stop checking others
        if (promoDiscount > 0) {
          discount = promoDiscount;
          appliedPromotion = promo;

          // Check if there are MORE promotions that would also qualify
          let hasMoreQualifying = false;
          for (let j = promotions.indexOf(promo) + 1; j < promotions.length; j++) {
            const nextPromo = promotions[j];
            const nextEligible = cart.filter(cartItem => nextPromo.included_items && nextPromo.included_items.includes(cartItem.name));
            if (nextEligible.length > 0) {
              let nextPool: { price: number }[] = [];
              nextEligible.forEach(item => { for (let i = 0; i < item.quantity; i++) nextPool.push({ price: parseFloat(item.price) }); });

              if (nextPromo.type === 'bogo' && Math.floor(nextPool.length / nextPromo.buy_qty) > 0) {
                hasMoreQualifying = true;
                break;
              } else if (nextPromo.type === 'bundle' && Math.floor(nextPool.length / nextPromo.bundle_qty) > 0) {
                hasMoreQualifying = true;
                break;
              }
            }
          }

          if (hasMoreQualifying && !showMultiOfferWarning) {
            setTimeout(() => setShowMultiOfferWarning(true), 500);
          }

          break; // Only apply ONE promotion
        }
      }
    } else {
      // If discount code is applied, check if cart would qualify for a promotion and show warning
      let wouldQualifyForPromo = false;
      for (const promo of promotions) {
        const eligibleItems = cart.filter(cartItem => promo.included_items && promo.included_items.includes(cartItem.name));
        if (eligibleItems.length > 0) {
          let itemsPool: { price: number }[] = [];
          eligibleItems.forEach(item => { for (let i = 0; i < item.quantity; i++) itemsPool.push({ price: parseFloat(item.price) }); });

          if ((promo.type === 'bogo' && Math.floor(itemsPool.length / promo.buy_qty) > 0) ||
            (promo.type === 'bundle' && Math.floor(itemsPool.length / promo.bundle_qty) > 0)) {
            wouldQualifyForPromo = true;
            break;
          }
        }
      }

      if (wouldQualifyForPromo && !showMultiOfferWarning) {
        setTimeout(() => setShowMultiOfferWarning(true), 500);
      }
    }

    let codeDiscount = 0;
    if (appliedDiscountCode) {
      if (appliedDiscountCode.discount_type === 'percentage') {
        codeDiscount = (subtotal * appliedDiscountCode.discount_value) / 100;
      } else {
        codeDiscount = appliedDiscountCode.discount_value;
      }
    }

    const totalBeforePoints = subtotal - discount - codeDiscount;
    let pointsDiscount = 0;
    const minPoints = 50; // default min points to redeem

    if (redeemPoints && pointsBalance >= minPoints) {
      pointsDiscount = (pointsBalance * pointValuePence) / 100;
      if (pointsDiscount > totalBeforePoints) pointsDiscount = totalBeforePoints;
    }

    const finalTotal = totalBeforePoints - pointsDiscount;
    const platformFee = (companySettings?.stripe_connect_account_id && (finalTotal > 0 || recurring !== 'none')) ? 1.00 : 0;
    const grandTotal = finalTotal + platformFee;
    const potential = Math.floor(finalTotal * pointsPerPound);
    return { subtotal, discount, codeDiscount, pointsDiscount, platformFee, finalTotal: grandTotal, potential, appliedPromotion };
  };
  const totals = calculateTotals();

  const addToCart = (item: ServiceProduct) => {
    const existing = cart.find(i => i.name === item.name);
    const itemPrice = item.price_numeric || item.price || parseFloat(String(item.price_display || '').replace(/[^0-9.]/g, '')) || 0;
    if (existing) {
      setCart(cart.map(i => i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { name: item.name, price: itemPrice.toString(), quantity: 1, note: '' }]);
    }
  };
  const updateQuantity = (itemName: string, delta: number) => { const existing = cart.find(i => i.name === itemName); if (!existing) return; const newQty = existing.quantity + delta; if (newQty <= 0) setCart(cart.filter(i => i.name !== itemName)); else setCart(cart.map(i => i.name === itemName ? { ...i, quantity: newQty } : i)); };
  const updateNote = (itemName: string, note: string) => setCart(cart.map(i => i.name === itemName ? { ...i, note } : i));
  const removeFromCart = (itemName: string) => setCart(cart.filter(i => i.name !== itemName));
  const toggleCat = (catName: string) => setExpandedCats(expandedCats.includes(catName) ? expandedCats.filter(c => c !== catName) : [...expandedCats, catName]);
  const checkLoyalty = async () => { if (!customer.email || !tenant) return; const { data } = await supabase.from('cp_customers').select('loyalty_points').eq('email', customer.email).eq('tenant_id', tenant.id).single(); if (data) setPointsBalance(data.loyalty_points); else setPointsBalance(0); };

  const applyDiscountCode = async () => {
    if (!discountCodeInput.trim()) return;
    if (!currentUser) {
      setCodeError('Please log in to use discount codes');
      return;
    }

    // Check if a promotion is already applied
    const currentTotals = calculateTotals();
    if (currentTotals.appliedPromotion) {
      setShowMultiOfferWarning(true);
      setCodeError('');
      setDiscountCodeInput('');
      return;
    }

    setCodeError('');

    const { data, error } = await supabase
      .from('cp_discount_codes')
      .select('*')
      .eq('code', discountCodeInput.toUpperCase())
      .eq('active', true)
      .eq('tenant_id', tenant.id)
      .single();

    if (error || !data) {
      setCodeError('Invalid or expired code');
      return;
    }

    // Check expiry
    if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
      setCodeError('This code has expired');
      return;
    }

    // Check one-time use
    if (data.one_time_use) {
      const { data: usedOrders } = await supabase
        .from('cp_orders')
        .select('id')
        .eq('customer_email', currentUser.email)
        .eq('discount_code', data.code);

      if (usedOrders && usedOrders.length > 0) {
        setCodeError('You have already used this code');
        return;
      }
    }

    setAppliedDiscountCode(data);
    setDiscountCodeInput('');
    alert(`Code applied! You saved ${data.discount_type === 'percentage' ? data.discount_value + '%' : '£' + data.discount_value}`);
  };

  const submitOrder = async () => {
    console.log('--- STARTING ORDER SUBMISSION ---');
    console.log('Customer Details:', customer);
    console.log('Selected Slot:', selectedSlot);
    console.log('Cart Items:', cart);

    if (!customer.name || !customer.phone || !customer.address || !selectedSlot) {
      console.warn('Submission blocked: Missing details');
      alert("Please fill in all details and select a collection slot.");
      return;
    }

    if (createAccount && !accountPassword) {
      console.warn('Submission blocked: Password missing for new account');
      alert("Please enter a password to create your account.");
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching store settings...');
      let storeEmail = '';
      const { data: settings, error: settingsError } = await supabase.from('cp_app_settings').select('value').eq('key', 'store_email').eq('tenant_id', tenant.id).single();

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.warn('Error fetching settings:', settingsError);
      }
      if (settings) storeEmail = settings.value;

      const readableId = Math.random().toString(36).substring(2, 6).toUpperCase();
      console.log('Generated Order ID:', readableId);

      let userPreferences = {};
      if (currentUser) {
        userPreferences = {
          starch: currentUser.starch_level,
          finish: currentUser.finish_style,
          trouser_crease: currentUser.trouser_crease,
          auth_repairs: currentUser.auth_repairs,
          detergent: currentUser.detergent,
          no_plastic: currentUser.no_plastic,
          recycle_hangers: currentUser.recycle_hangers
        };
      }

      // Find slot label for DB
      const slotObj = availableSlots.find(s => s.id === selectedSlot);
      const slotLabel = slotObj ? `${slotObj.day} ${slotObj.label}` : 'Flexible';

      // Get or create customer_id for proper FK relationship
      let customerId: string | null = null;
      if (currentUser?.id) {
        customerId = currentUser.id;
      } else if (customer.email) {
        // Look up existing customer or create new one
        const { data: existingCustomer } = await supabase
          .from('cp_customers')
          .select('id')
          .eq('email', customer.email)
          .eq('tenant_id', tenant.id)
          .single();
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }

      const orderData: any = {
        readable_id: readableId,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_address: customer.address,
        collection_slot_id: selectedSlot === 'anytime' ? null : selectedSlot,
        collection_slot_label: slotLabel,
        status: 'pending',
        total_amount: totals.finalTotal,
        points_earned: totals.potential,
        points_redeemed: redeemPoints ? pointsBalance : 0,
        discount_amount: totals.discount + totals.codeDiscount + totals.pointsDiscount,
        discount_code: appliedDiscountCode?.code || null,
        recurring_frequency: recurring,
        marketing_opt_in: marketingOptIn,
        preferences: userPreferences,
        tenant_id: tenant.id
      };

      // Add customer_id if we have one
      if (customerId) {
        orderData.customer_id = customerId;
      }

      console.log('Inserting order into DB:', orderData);
      const { data: orderResult, error: orderError } = await supabase.from('cp_orders').insert([orderData]).select().single();

      if (orderError) throw orderError;
      console.log('Order inserted successfully!', orderResult);

      // Insert Order Items
      if (cart.length > 0) {
        const itemRows = cart.map(item => ({
          order_id: orderResult.id,
          item_name: item.name,
          quantity: item.quantity,
          unit_price: parseFloat(item.price),
          tenant_id: tenant.id
        }));
        const { error: itemsError } = await supabase.from('cp_order_items').insert(itemRows);
        if (itemsError) console.warn('Order items insert error:', itemsError);
      }

      let newBalance = pointsBalance + totals.potential;
      if (redeemPoints) newBalance = totals.potential;

      const customerUpdate: any = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        loyalty_points: newBalance,
        notes: customer.notes,
        subscription_frequency: recurring,
        subscription_paused: false,
        tenant_id: tenant.id
      };

      if (createAccount && accountPassword) {
        customerUpdate.password = accountPassword;
      }

      console.log('Updating customer profile/account...');
      const { data: customerRecord, error: custError } = await supabase.from('cp_customers').upsert(customerUpdate, { onConflict: 'email' }).select().single();
      if (custError) console.warn('Customer upsert non-critical error:', custError);

      // Update order with customer_id if we didn't have it initially (new customer)
      if (customerRecord && !customerId) {
        await supabase.from('cp_orders').update({ customer_id: customerRecord.id }).eq('id', orderResult.id);
      }

      // --- NEW: Generate and store invoice in DB ---
      if (customerRecord) {
        const invoiceData = {
          customer_id: customerRecord.id,
          order_id: orderResult.id,
          invoice_number: readableId,
          amount: totals.finalTotal,
          items: cart,
          tenant_id: tenant.id
        };
        console.log('Saving invoice to DB:', invoiceData);
        await supabase.from('cp_invoices').insert([invoiceData]);
      }

      // --- Stripe Payment / Subscription Integration ---
      // Only require Stripe payment if tenant uses per-transaction billing
      const requiresStripePayment = tenant?.billing_type === 'per_transaction' &&
        companySettings?.stripe_connect_account_id &&
        (totals.finalTotal > 0 || recurring !== 'none');

      if (requiresStripePayment) {
        console.log('Initiating Stripe Payment Redirect...');
        try {
          const { data: stripeData, error: stripeInvokeError } = await supabase.functions.invoke('stripe-payment', {
            body: {
              action: 'create-checkout-session',
              amount: totals.finalTotal,
              email: customer.email,
              customerName: customer.name,
              recurring: recurring,
              tenantId: tenant.id,
              orderId: orderResult.id
            }
          });

          if (stripeInvokeError) {
            console.error('Stripe Function Error:', stripeInvokeError);
          } else if (stripeData?.url) {
            // Store the session ID in the order before redirecting
            if (stripeData.sessionId) {
              await supabase.from('cp_orders').update({ stripe_sessionId: stripeData.sessionId }).eq('id', orderResult.id);
            }
            window.location.href = stripeData.url;
            return;
          }
        } catch (stErr: any) {
          console.error('Failed to initiate Stripe:', stErr);
        }
      }

      if (!currentUser) {
        const { data: userData } = await supabase.from('cp_customers').select('*').eq('email', customer.email).eq('tenant_id', tenant.id).single();
        if (userData) onLoginSuccess(userData);
      } else {
        onLoginSuccess({ ...currentUser, ...customerUpdate });
      }

      console.log('Triggering email confirmation...');
      await sendOrderConfirmation({
        name: customer.name,
        email: customer.email,
        orderId: readableId,
        items: cart,
        storeEmail: storeEmail,
        storeName: tenant.name,
        totalOverride: totals.finalTotal.toFixed(2),
        slotLabel: slotLabel
      });

      setCart([]);
      console.log('Order Flow Complete.');
      alert("Order submitted successfully! Confirmation emails have been sent to your account and the store.");
      setPage('customer-portal');

    } catch (err: any) {
      console.error('CRITICAL ERROR IN SUBMIT ORDER:', err);
      alert("Order submission failed: " + (err.message || "Unknown error occurred"));
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) { return <div className="pt-32 pb-20 text-center flex justify-center"><Loader2 className="animate-spin text-trust-blue" size={48} /></div>; }

  const isCancel = new URLSearchParams(window.location.search).get('payment') === 'cancel';

  return (
    <div className="pt-28 pb-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in">
      {isCancel && (
        <div className="mb-6 bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
          <div className="bg-orange-100 p-2 rounded-full"><AlertCircle size={24} className="text-orange-600" /></div>
          <div>
            <p className="font-bold">Payment Cancelled</p>
            <p className="text-sm">Your payment was not completed. You can try again below or choose a different payment method.</p>
          </div>
        </div>
      )}
      {/* Multiple Offers Warning Modal */}
      {showMultiOfferWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative transform transition-all duration-300 scale-100">
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full p-4 shadow-lg">
                <AlertCircle size={40} className="text-white" />
              </div>
            </div>

            <div className="mt-8 text-center">
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Oops! Only One Offer Per Order</h3>
              <p className="text-gray-600 mb-2">
                You can only use <span className="font-bold text-trust-blue">one offer per order</span> - either a promotion OR a discount code.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {totals.appliedPromotion ? "You already have a promotion applied!" : appliedDiscountCode ? "You already have a discount code applied!" : "We've applied the best deal for you! 🎉"}
              </p>

              {totals.appliedPromotion && (
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
                  <div className="text-sm font-bold text-green-800 mb-1">Currently Applied:</div>
                  <div className="text-lg font-bold text-green-600">
                    {totals.appliedPromotion.type === 'bogo'
                      ? `Buy ${totals.appliedPromotion.buy_qty} Get ${totals.appliedPromotion.get_qty} Free`
                      : `${totals.appliedPromotion.bundle_qty} Items for £${totals.appliedPromotion.bundle_price}`
                    }
                  </div>
                  <div className="text-sm text-green-700 mt-1">Saving you £{totals.discount.toFixed(2)}!</div>
                </div>
              )}

              {appliedDiscountCode && !totals.appliedPromotion && (
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
                  <div className="text-sm font-bold text-green-800 mb-1">Currently Applied:</div>
                  <div className="text-lg font-bold text-green-600">
                    Code: {appliedDiscountCode.code}
                  </div>
                  <div className="text-sm text-green-700 mt-1">
                    {appliedDiscountCode.discount_type === 'percentage'
                      ? `${appliedDiscountCode.discount_value}% off`
                      : `£${appliedDiscountCode.discount_value} off`}
                  </div>
                </div>
              )}

              {appliedDiscountCode && !totals.appliedPromotion ? (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setAppliedDiscountCode(null);
                      setShowMultiOfferWarning(false);
                    }}
                    className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:shadow-lg transition-all transform hover:scale-105"
                  >
                    Remove Discount Code
                  </button>
                  <button
                    onClick={() => setShowMultiOfferWarning(false)}
                    className="w-full bg-gray-100 text-gray-700 py-2 px-6 rounded-lg font-bold text-sm hover:bg-gray-200 transition-all"
                  >
                    Keep Discount Code
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowMultiOfferWarning(false)}
                  className="w-full bg-gradient-to-r from-trust-blue to-blue-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:shadow-lg transition-all transform hover:scale-105"
                >
                  Got it, thanks!
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center mb-12"><div className="flex items-center"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-trust-blue text-white' : 'bg-gray-200 text-gray-500'}`}>1</div><div className={`w-16 h-1 ${step >= 2 ? 'bg-trust-blue' : 'bg-gray-200'}`} /><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-trust-blue text-white' : 'bg-gray-200 text-gray-500'}`}>2</div><div className={`w-16 h-1 ${step >= 3 ? 'bg-trust-blue' : 'bg-gray-200'}`} /><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-trust-blue text-white' : 'bg-gray-200 text-gray-500'}`}>3</div></div></div>

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="font-bold text-2xl mb-4">Select Items</h2>

            {/* Search Bar */}
            <div className="relative mb-4">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search services... (e.g. shirt, dress, alterations)"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="w-full pl-12 pr-10 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-trust-blue focus:border-trust-blue transition-all"
              />
              {serviceSearch && (
                <button
                  onClick={() => setServiceSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Order Again / Favorites Section */}
            {currentUser && recentItems.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Heart size={18} className="text-amber-500" fill="currentColor" />
                  <span className="font-bold text-gray-800">Order Again</span>
                  <span className="text-xs text-gray-500">Your frequently ordered items</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentItems.map(item => {
                    const svc = services.find(s => s.name === item.name);
                    const cartItem = cart.find(i => i.name === item.name);
                    const qtyInCart = cartItem ? cartItem.quantity : 0;

                    return (
                      <button
                        key={item.name}
                        onClick={() => {
                          if (svc) addToCart(svc);
                          else setCart([...cart, { name: item.name, price: item.price, quantity: 1, note: '' }]);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          qtyInCart > 0
                            ? 'bg-trust-blue text-white shadow-md'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-trust-blue hover:text-trust-blue'
                        }`}
                      >
                        <span>{item.name}</span>
                        <span className="text-xs opacity-75">£{parseFloat(item.price).toFixed(2)}</span>
                        {qtyInCart > 0 && (
                          <span className="bg-white text-trust-blue text-xs font-bold px-1.5 py-0.5 rounded-full">{qtyInCart}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Helper for Valet Bags */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => {
                  // Clear existing cart if user wants a clean valet bag order
                  setCart([{ name: 'Weekly Valet Bag (Collection Request)', price: '0', quantity: 1 }]);
                  setRecurring('weekly');
                }}
                className="bg-blue-50 hover:bg-blue-100 border border-blue-200 p-4 rounded-xl flex flex-col items-center justify-center text-center transition group"
              >
                <div className="bg-white p-3 rounded-full mb-2 shadow-sm group-hover:scale-110 transition-transform">
                  <ShoppingBag className="text-trust-blue" size={24} />
                </div>
                <h3 className="font-bold text-trust-blue">Weekly Valet Bag</h3>
                <p className="text-xs text-gray-500 mt-1">We collect, clean & bill later</p>
              </button>

              <button
                onClick={() => {
                  setCart([{ name: 'Bi-Weekly Valet Bag (Collection Request)', price: '0', quantity: 1 }]);
                  setRecurring('2weekly');
                }}
                className="bg-purple-50 hover:bg-purple-100 border border-purple-200 p-4 rounded-xl flex flex-col items-center justify-center text-center transition group"
              >
                <div className="bg-white p-3 rounded-full mb-2 shadow-sm group-hover:scale-110 transition-transform">
                  <ShoppingBag className="text-purple-600" size={24} />
                </div>
                <h3 className="font-bold text-purple-600">Bi-Weekly Valet Bag</h3>
                <p className="text-xs text-gray-500 mt-1">Every two weeks collection</p>
              </button>
            </div>

            {(() => {
              // Filter services by search term
              const filteredServices = serviceSearch.trim()
                ? services.filter(svc =>
                    svc.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
                    (svc.category && svc.category.toLowerCase().includes(serviceSearch.toLowerCase()))
                  )
                : services;

              // Group items by category only (no subcategory)
              const servicesByCategory: Record<string, ServiceProduct[]> = {};
              filteredServices.forEach(svc => {
                const cat = svc.category || 'Uncategorized';
                if (!servicesByCategory[cat]) servicesByCategory[cat] = [];
                servicesByCategory[cat].push(svc);
              });

              // Sort categories based on the categories table if available, else alphabetically
              const sortedCategoryNames = Object.keys(servicesByCategory).sort((a, b) => {
                const catA = categories.find(c => c.name === a);
                const catB = categories.find(c => c.name === b);
                const orderA = catA ? catA.sort_order : 999;
                const orderB = catB ? catB.sort_order : 999;

                if (orderA !== orderB) return orderA - orderB;
                return a.localeCompare(b);
              });

              if (sortedCategoryNames.length === 0 && !dataLoading) {
                return (
                  <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-500">{serviceSearch ? `No services found for "${serviceSearch}"` : 'No services available for this location yet.'}</p>
                  </div>
                );
              }

              // If searching, auto-expand all categories with matches
              const catsToShow = serviceSearch.trim() ? sortedCategoryNames : sortedCategoryNames;

              return catsToShow.map(catName => {
                const catServices = servicesByCategory[catName];
                const isCatExpanded = serviceSearch.trim() ? true : expandedCats.includes(catName);
                if (catServices.length === 0) return null;

                return (
                  <div key={catName} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4">
                    <button
                      onClick={() => toggleCat(catName)}
                      className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getCategoryIcon(catName)}</span>
                        <span className="font-bold text-gray-800 capitalize text-lg tracking-tight">{catName}</span>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-200/50 px-2 py-0.5 rounded-full uppercase">{catServices.length} Items</span>
                      </div>
                      {isCatExpanded ? <ChevronUp size={20} className="text-trust-blue" /> : <ChevronDown size={20} className="text-gray-400" />}
                    </button>
                    {isCatExpanded && (
                      <div className="divide-y divide-gray-100 animate-fade-in">
                        {catServices.map(svc => {
                          const cartItem = cart.find(i => i.name === svc.name);
                          const qtyInCart = cartItem ? cartItem.quantity : 0;

                          return (
                            <div key={svc.id} className="px-6 py-4 flex justify-between items-center hover:bg-blue-50/30 transition group">
                              <div className="flex-1">
                                <div className="font-bold text-gray-900 group-hover:text-trust-blue transition-colors">{svc.name}</div>
                                <div className="text-sm font-bold text-trust-blue/80 mt-0.5">
                                  {svc.price_display || formatPrice(svc.price_numeric || svc.price || 0)}
                                </div>
                              </div>
                              {qtyInCart > 0 ? (
                                <div className="flex items-center gap-2 bg-trust-blue/10 rounded-xl p-1">
                                  <button
                                    onClick={() => updateQuantity(svc.name, -1)}
                                    className="w-9 h-9 rounded-lg bg-white border border-gray-200 text-trust-blue hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition flex items-center justify-center font-bold text-lg"
                                  >
                                    −
                                  </button>
                                  <span className="w-8 text-center font-bold text-trust-blue">{qtyInCart}</span>
                                  <button
                                    onClick={() => updateQuantity(svc.name, 1)}
                                    className="w-9 h-9 rounded-lg bg-trust-blue text-white hover:bg-trust-blue-hover transition flex items-center justify-center font-bold text-lg"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(svc)}
                                  className="bg-white border-2 border-trust-blue text-trust-blue p-2 rounded-xl hover:bg-trust-blue hover:text-white transition shadow-sm hover:shadow-md flex items-center justify-center"
                                  title="Add to Basket"
                                >
                                  <Plus size={20} strokeWidth={3} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 h-fit sticky top-24">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-xl">Your Basket</h3>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1">
                  <Trash2 size={12} /> Empty Cart
                </button>
              )}
            </div>
            {cart.length === 0 ? <p className="text-gray-500 text-sm mb-6">No items selected.</p> : (
              <div className="space-y-4 mb-6">
                {cart.map(item => (
                  <div key={item.name} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start mb-2"><span className="font-semibold text-sm">{item.name}</span><span className="font-bold text-sm">£{(parseFloat(item.price) * item.quantity).toFixed(2)}</span></div>
                    <div className="flex items-center justify-between gap-2"><div className="flex items-center border border-gray-300 rounded-lg overflow-hidden"><button onClick={() => updateQuantity(item.name, -1)} className="px-2 py-1 bg-gray-50 hover:bg-gray-200 text-gray-600"><Minus size={14} /></button><span className="px-2 py-1 text-sm font-bold w-8 text-center">{item.quantity}</span><button onClick={() => updateQuantity(item.name, 1)} className="px-2 py-1 bg-gray-50 hover:bg-gray-200 text-gray-600"><Plus size={14} /></button></div><input type="text" placeholder="Add note..." value={item.note || ''} onChange={(e) => updateNote(item.name, e.target.value)} className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50" /><button onClick={() => removeFromCart(item.name)} className="text-red-400 hover:text-red-600 p-1"><X size={16} /></button></div>
                  </div>
                ))}
                <div className="flex justify-between items-center text-lg font-bold border-t pt-4 mt-2">< span>Subtotal</span><span>£{totals.subtotal.toFixed(2)}</span></div>
                {totals.discount > 0 && <div className="flex justify-between items-center text-sm font-bold text-green-600"><span>Offer Discount</span><span>-£{totals.discount.toFixed(2)}</span></div>}

                {/* Discount Code Section */}
                {currentUser && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    {!appliedDiscountCode ? (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2">Have a discount code?</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Enter code"
                            value={discountCodeInput}
                            onChange={(e) => { setDiscountCodeInput(e.target.value.toUpperCase()); setCodeError(''); }}
                            className="flex-1 border rounded px-3 py-2 text-sm font-bold uppercase"
                          />
                          <button onClick={applyDiscountCode} className="bg-trust-blue text-white px-4 py-2 rounded font-bold text-sm hover:bg-trust-blue-hover">Apply</button>
                        </div>
                        {codeError && <div className="text-xs text-red-500 mt-1 font-bold">{codeError}</div>}
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs font-bold text-gray-700">Code: {appliedDiscountCode.code}</div>
                          <div className="text-[10px] font-bold text-green-600">Saving £{totals.codeDiscount.toFixed(2)}</div>
                        </div>
                        <button onClick={() => setAppliedDiscountCode(null)} className="text-red-400 hover:text-red-600 text-xs font-bold">Remove</button>
                      </div>
                    )}
                  </div>
                )}
                {totals.codeDiscount > 0 && <div className="flex justify-between items-center text-sm font-bold text-green-600"><span>Code Discount</span><span>-£{totals.codeDiscount.toFixed(2)}</span></div>}

                {/* Loyalty Points Redemption UI - Simplified */}
                {pointsBalance >= 50 && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift size={16} className="text-yellow-600" />
                        <div>
                          <div className="text-xs font-bold text-gray-700">Use {pointsBalance} points</div>
                          {redeemPoints && <div className="text-[10px] font-bold text-yellow-700">Saving £{totals.pointsDiscount.toFixed(2)} off total</div>}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={redeemPoints} onChange={(e) => setRedeemPoints(e.target.checked)} />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-500"></div>
                      </label>
                    </div>
                  </div>
                )}

                {totals.platformFee > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold text-gray-500">
                    <span>Platform Fee</span>
                    <span>£{totals.platformFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-lg font-bold border-t pt-4 mt-2 text-trust-blue"><span>Total</span><span>£{totals.finalTotal.toFixed(2)}</span></div>

                {/* Enhanced Loyalty Points Earned Display */}
                {totals.potential > 0 && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border-2 border-yellow-300 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-yellow-400 p-2 rounded-full">
                          <Gift size={20} className="text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-600">You'll Earn</div>
                          <div className="text-2xl font-bold text-yellow-600">{totals.potential} Points!</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Keep collecting</div>
                        <div className="text-xs font-bold text-yellow-700">for more rewards</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Refer a Friend Section - Customer Facing */}
                {currentUser && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="bg-green-500 p-1.5 rounded-full">
                        <Heart size={14} className="text-white" fill="white" />
                      </div>
                      <div className="font-bold text-gray-800 text-sm">Refer a Friend</div>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">Give £5, Get £5! Share your code with friends.</p>
                    <div className="flex items-center gap-2 mb-3">
                      <code className="flex-1 text-center font-bold text-green-700 bg-white px-3 py-2 rounded-lg border border-green-200 text-sm">
                        {currentUser.email?.split('@')[0]?.toUpperCase().slice(0, 8) || 'FRIEND'}
                      </code>
                      <button
                        onClick={() => {
                          const code = currentUser.email?.split('@')[0]?.toUpperCase().slice(0, 8) || 'FRIEND';
                          navigator.clipboard.writeText(code);
                          alert('Code copied!');
                        }}
                        className="p-2 bg-white border border-green-200 rounded-lg hover:bg-green-50 transition"
                      >
                        <Copy size={16} className="text-green-600" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const code = currentUser.email?.split('@')[0]?.toUpperCase().slice(0, 8) || 'FRIEND';
                          const msg = `Hey! Get £5 off your first order at ${tenant?.name}! Use my referral code: ${code} 🧺✨`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-xs font-bold transition"
                      >
                        <MessageCircle size={14} /> WhatsApp
                      </button>
                      <button
                        onClick={() => {
                          const code = currentUser.email?.split('@')[0]?.toUpperCase().slice(0, 8) || 'FRIEND';
                          const subject = `Get £5 off at ${tenant?.name}!`;
                          const body = `Hey!\n\nI've been using ${tenant?.name} for my dry cleaning and they're great!\n\nUse my referral code to get £5 off your first order: ${code}\n\nEnjoy! 🧺`;
                          window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                        }}
                        className="flex-1 flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-xs font-bold transition"
                      >
                        <Mail size={14} /> Email
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setStep(2)} disabled={cart.length === 0} className="w-full bg-trust-blue text-white py-3 rounded-lg font-bold hover:bg-trust-blue-hover transition disabled:opacity-50 disabled:cursor-not-allowed">Select Collection Slot</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-100">
          <h2 className="font-bold text-2xl mb-6">Select Collection Slot</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">{availableSlots.length > 0 ? availableSlots.map(slot => (<button key={slot.id} onClick={() => setSelectedSlot(slot.id)} className={`flex flex-col p-4 rounded-xl border-2 text-left transition relative overflow-hidden group ${selectedSlot === slot.id ? 'border-trust-blue bg-blue-50 text-trust-blue shadow-md' : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'}`}><div className="font-bold text-lg mb-1">{slot.day}</div><div className="flex items-center gap-2 text-sm opacity-80"><Clock size={16} /> {slot.label} - {getNextDate(slot.day)}</div>{selectedSlot === slot.id && <div className="absolute top-2 right-2 bg-trust-blue text-white rounded-full p-1"><Check size={12} /></div>}</button>)) : <p className="text-gray-500 col-span-2 text-center py-4 bg-gray-50 rounded-lg">No slots available.</p>}<button onClick={() => setSelectedSlot('anytime')} className={`flex flex-col p-4 rounded-xl border-2 text-left transition relative overflow-hidden group ${selectedSlot === 'anytime' ? 'border-trust-blue bg-blue-50 text-trust-blue shadow-md' : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'}`}><div className="font-bold text-lg mb-1">Anytime</div><div className="flex items-center gap-2 text-sm opacity-80"><Clock size={16} /> Flexible (8am - 5pm)</div>{selectedSlot === 'anytime' && <div className="absolute top-2 right-2 bg-trust-blue text-white rounded-full p-1"><Check size={12} /></div>}</button></div>
          <div className="flex justify-between border-t pt-6"><button onClick={() => setStep(1)} className="text-gray-500 font-bold hover:text-gray-700">Back</button><button onClick={() => setStep(3)} disabled={!selectedSlot} className="bg-trust-blue text-white px-8 py-3 rounded-lg font-bold hover:bg-trust-blue-hover disabled:opacity-50 flex items-center gap-2">Enter Details</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-100">
          <h2 className="font-bold text-2xl mb-6">Collection Details</h2>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label><input type="text" className="w-full border rounded-lg p-3" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} /></div><div><label className="block text-sm font-bold text-gray-700 mb-1">Phone</label><input type="tel" className="w-full border rounded-lg p-3" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} /></div></div>
            <div><label className="block text-sm font-bold text-gray-700 mb-1">Email</label><input type="email" className="w-full border rounded-lg p-3" value={customer.email} onBlur={checkLoyalty} onChange={e => setCustomer({ ...customer, email: e.target.value })} /></div>
            <div><label className="block text-sm font-bold text-gray-700 mb-1">Collection Address</label><textarea className="w-full border rounded-lg p-3" rows={3} value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })}></textarea></div>
            <div><label className="block text-sm font-bold text-gray-700 mb-1">Delivery Notes / Gate Code</label><textarea className="w-full border rounded-lg p-3" rows={2} value={customer.notes} placeholder="e.g. Gate code 1234" onChange={e => setCustomer({ ...customer, notes: e.target.value })}></textarea></div>
            {(recurring === 'weekly' || recurring === '2weekly') && (
              <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
                <h4 className="font-bold text-purple-800 text-sm mb-2 flex items-center gap-2"><CreditCard size={16} /> Recurring Billing</h4>
                <p className="text-xs text-purple-700 mb-2">Since you have selected a recurring valet service, please authorise us to keep a card on file for automated weekly/bi-weekly billing.</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded text-purple-600 focus:ring-purple-500" defaultChecked />
                  <span className="text-xs font-bold text-gray-700">I authorize recurring payments on my card</span>
                </label>
              </div>
            )}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div><span className="block text-sm font-bold text-gray-700 mb-2">Recurring?</span><div className="flex gap-2"><button onClick={() => setRecurring('none')} className={`flex-1 py-2 rounded-lg text-sm border ${recurring === 'none' ? 'bg-blue-50 border-trust-blue text-trust-blue' : 'bg-white'}`}>One-off</button><button onClick={() => setRecurring('weekly')} className={`flex-1 py-2 rounded-lg text-sm border ${recurring === 'weekly' ? 'bg-blue-50 border-trust-blue text-trust-blue' : 'bg-white'}`}>Weekly</button><button onClick={() => setRecurring('2weekly')} className={`flex-1 py-2 rounded-lg text-sm border ${recurring === '2weekly' ? 'bg-blue-50 border-trust-blue text-trust-blue' : 'bg-white'}`}>Bi-Weekly</button></div></div>
              {!currentUser && (<div className="space-y-3"><label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition"><input type="checkbox" className="w-5 h-5 text-trust-blue rounded" checked={createAccount} onChange={e => setCreateAccount(e.target.checked)} /><div className="text-sm text-gray-700"><UserPlus size={16} className="inline mr-2" />Create an account</div></label>{createAccount && (<div className="ml-8 p-3 bg-blue-50 rounded-lg border border-blue-100 animate-fade-in"><label className="block text-xs font-bold text-gray-700 mb-1">Choose a Password</label><input type="password" className="w-full border rounded p-2 text-sm" placeholder="Enter password" value={accountPassword} onChange={e => setAccountPassword(e.target.value)} /></div>)}</div>)}
            </div>
            <div className="flex justify-between mt-8 pt-6 border-t">
              <button onClick={() => setStep(2)} className="text-gray-500 font-bold hover:text-gray-700">Back</button>
              <button
                onClick={submitOrder}
                disabled={!customer.name || !customer.phone || !customer.address || loading}
                className={`${(companySettings?.stripe_connect_account_id && (totals.finalTotal > 0 || recurring !== 'none')) ? 'bg-trust-blue' : 'bg-green-600'} text-white px-8 py-3 rounded-lg font-bold hover:opacity-90 disabled:opacity-50 shadow-lg flex items-center gap-2 transition-all transform active:scale-95`}
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />}
                {(companySettings?.stripe_connect_account_id && (totals.finalTotal > 0 || recurring !== 'none')) ? 'Pay & Confirm Booking' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- New Page Components ---

const HowItWorksPage: React.FC<{ tenant: any; setPage: (p: Page) => void }> = ({ tenant, setPage }) => (
  <div className="pt-28 pb-20 max-w-5xl mx-auto px-4 animate-fade-in">
    <div className="text-center mb-16">
      <h1 className="text-4xl font-bold mb-4">How {tenant.name} Makes Life Easier</h1>
      <p className="text-xl text-gray-600">Save time, money, and hassle with our streamlined pickup & delivery service.</p>
    </div>

    <div className="grid md:grid-cols-2 gap-12 items-center mb-16 border-b border-gray-100 pb-16">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><Clock className="text-trust-blue" /> Save Precious Time</h2>
        <p className="text-lg text-gray-700 leading-relaxed mb-4">No more rushing to the dry cleaners before work or trying to make it before closing time. We come to you.</p>
        <ul className="space-y-3">
          <li className="flex items-center gap-2"><Check className="text-green-500" /> Morning & Late Evening Slots</li>
          <li className="flex items-center gap-2"><Check className="text-green-500" /> 7 Days a Week Collection</li>
          <li className="flex items-center gap-2"><Check className="text-green-500" /> Book in seconds from your phone</li>
        </ul>
      </div>
      <div className="bg-blue-50 p-8 rounded-2xl flex items-center justify-center">
        <Calendar size={120} className="text-trust-blue opacity-50" />
      </div>
    </div>

    <div className="grid md:grid-cols-2 gap-12 items-center mb-16 border-b border-gray-100 pb-16">
      <div className="bg-green-50 p-8 rounded-2xl flex items-center justify-center order-last md:order-first">
        <TrendingUp size={120} className="text-eco-green opacity-50" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><TrendingUp className="text-eco-green" /> Save Money</h2>
        <p className="text-lg text-gray-700 leading-relaxed mb-4">Our "Weekly Valet Bag" service isn't just convenient—it's cost-effective.</p>
        <ul className="space-y-3">
          <li className="flex items-center gap-2"><Check className="text-green-500" /> Free Collection & Delivery</li>
          <li className="flex items-center gap-2"><Check className="text-green-500" /> Competitive Item Pricing</li>
          <li className="flex items-center gap-2"><Check className="text-green-500" /> Exclusive Loyalty Rewards</li>
        </ul>
      </div>
    </div>

    <div className="bg-gray-900 text-white rounded-3xl p-12 text-center">
      <h2 className="text-3xl font-bold mb-6">How To Place An Order</h2>
      <div className="grid md:grid-cols-4 gap-8 mb-12">
        <div className="relative">
          <div className="w-12 h-12 bg-trust-blue rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
          <h3 className="font-bold mb-2">Book Online</h3>
          <p className="text-gray-400 text-sm">Select items or choose "Valet Bag" for us to count later.</p>
        </div>
        <div className="relative">
          <div className="w-12 h-12 bg-trust-blue rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
          <h3 className="font-bold mb-2">We Collect</h3>
          <p className="text-gray-400 text-sm">Our friendly driver collects from your door at your chosen slot.</p>
        </div>
        <div className="relative">
          <div className="w-12 h-12 bg-trust-blue rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
          <h3 className="font-bold mb-2">Expert Care</h3>
          <p className="text-gray-400 text-sm">We clean, press, and quality check every garment.</p>
        </div>
        <div className="relative">
          <div className="w-12 h-12 bg-trust-blue rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">4</div>
          <h3 className="font-bold mb-2">Delivered</h3>
          <p className="text-gray-400 text-sm">Fresh clothes returned to you, ready to wear.</p>
        </div>
      </div>
      <button onClick={() => setPage('booking')} className="bg-white text-gray-900 hover:bg-gray-100 px-10 py-4 rounded-full font-bold text-xl shadow-lg transition-transform hover:scale-105">
        Get Started Now
      </button>
    </div>
  </div>
);

const HomePage: React.FC<{ tenant: any; setPage: (p: Page) => void }> = ({ tenant, setPage }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
      const { data } = await supabase
        .from('cp_categories')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true });
      if (data) setCategories(data);
      setLoading(false);
    };
    fetchHomeData();
  }, [tenant.id]);

  return (
    <div className="animate-fade-in">
      <div className="relative bg-gray-900 text-white pt-40 pb-32 px-4 text-center">
        <div className="absolute inset-0 opacity-30 bg-[url('/hero.png')] bg-cover bg-center" />
        <div className="relative max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 font-heading">Welcome to {tenant.name}</h1>
          <p className="text-xl text-gray-200 mb-8 max-w-2xl mx-auto">Professional care for your clothes. Eco-friendly, reliable, and delivered to your door in Winchester and surrounding areas.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={() => setPage('booking')} className="bg-trust-blue hover:bg-trust-blue-hover text-white px-8 py-4 rounded-full font-bold text-lg shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 group">Book Your Collection <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></button>
            <button onClick={() => setPage('services')} className="bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/20 px-8 py-4 rounded-full font-bold text-lg shadow-xl transition-all">View Our Price List</button>
          </div>
          <div className="mt-8 flex justify-center">
            <button onClick={() => setPage('how-it-works')} className="flex items-center gap-2 text-gray-300 hover:text-white font-bold border-b border-gray-600 hover:border-white pb-1 transition-all">
              <Info size={16} /> How it works: Free Pickup & Delivery
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Services Section */}
      <div className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">Our Professional Services</h2>
            <div className="w-24 h-1.5 bg-trust-blue mx-auto rounded-full mb-6" />
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">We offer a full range of specialist cleaning and repair services to keep your garments looking their best.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white h-48 rounded-3xl animate-pulse shadow-sm" />
              ))
            ) : (
              categories.slice(0, 8).map((cat, idx) => (
                <div
                  key={`${cat.name}-${idx}`}
                  onClick={() => {
                    // Navigate to services page and scroll to category?
                    // For now just navigate to services
                    setPage('services');
                  }}
                  className="group relative bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 cursor-pointer overflow-hidden text-center"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl font-black text-trust-blue italic">0{idx + 1}</span>
                  </div>
                  <div className="relative z-10">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-trust-blue rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-trust-blue group-hover:text-white transition-all duration-500 shadow-inner">
                      <Sparkles size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-trust-blue transition-colors mb-2">{cat.name}</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest bg-gray-100 dark:bg-gray-800 py-1 px-3 rounded-full inline-block group-hover:bg-blue-50 transition-colors">Expert Care</p>
                  </div>
                </div>
              ))
            )}
            <div
              onClick={() => setPage('services')}
              className="bg-trust-blue p-8 rounded-3xl shadow-xl flex flex-col items-center justify-center text-center text-white hover:bg-trust-blue-hover transition-all duration-300 cursor-pointer group"
            >
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ArrowRight size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">View All Services</h3>
              <p className="text-white/80 text-sm font-medium">Full price list & details</p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div className="p-8 bg-gray-50 rounded-3xl hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100">
            <div className="w-20 h-20 bg-blue-100 text-trust-blue rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Truck size={40} /></div>
            <h3 className="text-2xl font-bold mb-3 text-gray-900">Free Collection & Delivery</h3>
            <p className="text-gray-600 leading-relaxed font-medium text-lg">We pick up and deliver directly to your doorstep. Choose a time that suits you.</p>
          </div>
          <div className="p-8 bg-gray-50 rounded-3xl hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100 md:scale-110 md:z-10 shadow-sm">
            <div className="w-20 h-20 bg-green-100 text-eco-green rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Leaf size={40} /></div>
            <h3 className="text-2xl font-bold mb-3 text-gray-900">Eco-Friendly Cleaning</h3>
            <p className="text-gray-600 leading-relaxed font-medium text-lg">Advanced wet cleaning technology that is organic, tough on stains, and kind to fibers.</p>
          </div>
          <div className="p-8 bg-gray-50 rounded-3xl hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100">
            <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Sparkles size={40} /></div>
            <h3 className="text-2xl font-bold mb-3 text-gray-900">Quality Guaranteed</h3>
            <p className="text-gray-600 leading-relaxed font-medium text-lg">Every item is inspected by hand and finished to the highest standard of care.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ServicesPage: React.FC<{ tenant: any }> = ({ tenant }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      const { data: cats } = await supabase.from('cp_categories').select('*').eq('tenant_id', tenant.id).order('sort_order', { ascending: true });
      const { data: svcs } = await supabase.from('cp_services').select('*').eq('tenant_id', tenant.id);
      if (cats) setCategories(cats);
      if (svcs) setServices(svcs);
      setLoading(false);
    };
    fetchServices();
  }, [tenant]);

  return (
    <div className="pt-28 pb-20 max-w-5xl mx-auto px-4 animate-fade-in">
      <h1 className="text-3xl font-bold text-center mb-8">Services & Pricing at {tenant.name}</h1>
      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-trust-blue" /></div>
      ) : (
        <div className="space-y-8">
          {(() => {
            // Group by category only (no subcategory)
            const servicesByCategory: Record<string, any[]> = {};
            services.forEach(svc => {
              const cat = svc.category || 'Uncategorized';
              if (!servicesByCategory[cat]) servicesByCategory[cat] = [];
              servicesByCategory[cat].push(svc);
            });

            const tableCats = categories.map(c => c.name);
            const serviceCats = Object.keys(servicesByCategory);
            const allCats = Array.from(new Set([...tableCats, ...serviceCats])).sort((a, b) => {
              const catA = categories.find(c => c.name === a);
              const catB = categories.find(c => c.name === b);
              return (catA?.sort_order ?? 999) - (catB?.sort_order ?? 999);
            });

            return allCats.map(catName => {
              const catServices = servicesByCategory[catName];
              if (!catServices || catServices.length === 0) return null;

              return (
                <div key={catName} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <div className="bg-trust-blue/10 dark:bg-trust-blue/20 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-xl font-bold text-trust-blue flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-trust-blue rounded-full" />
                      {catName}
                      <span className="text-sm font-normal text-gray-500 ml-2">({catServices.length} items)</span>
                    </h3>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {catServices.map(s => (
                      <div key={s.id} className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{s.name}</span>
                        <span className="font-bold text-trust-blue">£{parseFloat(String(s.price_numeric || 0)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};

const ContactPage: React.FC<{ settings?: any }> = ({ settings }) => (
  <div className="pt-28 pb-20 max-w-4xl mx-auto px-4 animate-fade-in">
    <h1 className="text-3xl font-bold text-center mb-12">Contact Us</h1>
    <div className="grid md:grid-cols-3 gap-8 text-center">
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <MapPin className="w-8 h-8 mx-auto text-trust-blue mb-4" />
        <h3 className="font-bold mb-2">Visit Us</h3>
        <p className="text-gray-600 whitespace-pre-line">{settings?.store_address || 'Available at various partner locations nationwide.'}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <Phone className="w-8 h-8 mx-auto text-trust-blue mb-4" />
        <h3 className="font-bold mb-2">Call Us</h3>
        <p className="text-gray-600">{settings?.store_phone || '01962 861998'}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <Clock className="w-8 h-8 mx-auto text-trust-blue mb-4" />
        <h3 className="font-bold mb-2">Opening Hours</h3>
        <p className="text-gray-600">Mon - Sat: 8:30 - 17:30<br />Sun: Closed</p>
      </div>
    </div>
  </div>
);


// Enhanced Reports Tab Component - Corporate Style
type ReportView = 'dashboard' | 'revenue' | 'top-items' | 'busiest-times' | 'customers' | 'preferences' | 'drivers' | 'services' | 'subscriptions';

const ReportsTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [activeReport, setActiveReport] = useState<ReportView>('dashboard');
  const [dateRange, setDateRange] = useState(() => getDateRangePreset('month'));
  const [datePreset, setDatePreset] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('month');
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Data states
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [previousPeriodOrders, setPreviousPeriodOrders] = useState<any[]>([]);
  const [tableSearchTerm, setTableSearchTerm] = useState('');
  const [tableSortConfig, setTableSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Collection Failed Modal states
  const [showCollectionFailedModal, setShowCollectionFailedModal] = useState(false);
  const [collectionFailedOrderId, setCollectionFailedOrderId] = useState<string | null>(null);
  const [collectionFailedReason, setCollectionFailedReason] = useState('');

  const handleCollectionFailed = async () => {
    if (!collectionFailedOrderId || !collectionFailedReason) return;
    await supabase.from('cp_orders').update({
      status: 'collection_failed',
      notes: `Collection failed: ${collectionFailedReason}`
    }).eq('id', collectionFailedOrderId);
    setShowCollectionFailedModal(false);
    setCollectionFailedOrderId(null);
    setCollectionFailedReason('');
  };

  // Fetch all data
  const fetchReportData = async () => {
    setLoading(true);

    // Calculate previous period for comparison
    const currentStart = new Date(dateRange.start);
    const currentEnd = new Date(dateRange.end);
    const periodLength = currentEnd.getTime() - currentStart.getTime();
    const previousStart = new Date(currentStart.getTime() - periodLength);
    const previousEnd = new Date(currentStart.getTime() - 1);

    // Fetch current period orders
    const { data: ordersData } = await supabase
      .from('cp_orders')
      .select(`*, collection_driver:cp_drivers!collection_driver_id(name), delivery_driver:cp_drivers!delivery_driver_id(name)`)
      .eq('tenant_id', tenantId)
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end + 'T23:59:59')
      .order('created_at', { ascending: false });

    // Fetch previous period for comparison
    const { data: prevOrdersData } = await supabase
      .from('cp_orders')
      .select('total_amount, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString());

    // Fetch customers
    const { data: customersData } = await supabase
      .from('cp_customers')
      .select('*')
      .eq('tenant_id', tenantId);

    if (ordersData) setOrders(ordersData);
    if (prevOrdersData) setPreviousPeriodOrders(prevOrdersData);
    if (customersData) setCustomers(customersData);

    setLoading(false);
  };

  useEffect(() => {
    fetchReportData();
  }, [dateRange, tenantId]);

  // Handle date preset change
  const handlePresetChange = (preset: 'today' | 'week' | 'month' | 'quarter' | 'year') => {
    setDatePreset(preset);
    setDateRange(getDateRangePreset(preset));
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const prevRevenue = previousPeriodOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    const prevOrders = previousPeriodOrders.length;

    const revenueChange = calculatePercentChange(totalRevenue, prevRevenue);
    const ordersChange = calculatePercentChange(totalOrders, prevOrders);

    // Unique customers in period
    const uniqueCustomers = new Set(orders.map(o => o.customer_email)).size;

    // Repeat rate
    const customerOrderCounts: Record<string, number> = {};
    orders.forEach(o => {
      customerOrderCounts[o.customer_email] = (customerOrderCounts[o.customer_email] || 0) + 1;
    });
    const repeatCustomers = Object.values(customerOrderCounts).filter(c => c > 1).length;
    const repeatRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;

    // Active subscriptions
    const activeSubscriptions = customers.filter(c => c.subscription_frequency && c.subscription_frequency !== 'none' && !c.subscription_paused).length;

    return { totalRevenue, totalOrders, avgOrderValue, revenueChange, ordersChange, uniqueCustomers, repeatRate, activeSubscriptions };
  }, [orders, previousPeriodOrders, customers]);

  // Top selling items
  const topSellingItems = useMemo(() => {
    const itemStats: Record<string, { name: string; quantity: number; revenue: number; orders: number }> = {};

    orders.forEach(order => {
      const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items || [];
      items.forEach((item: any) => {
        const name = item.name || 'Unknown';
        if (!itemStats[name]) {
          itemStats[name] = { name, quantity: 0, revenue: 0, orders: 0 };
        }
        itemStats[name].quantity += item.quantity || 1;
        itemStats[name].revenue += (parseFloat(item.price) || 0) * (item.quantity || 1);
        itemStats[name].orders += 1;
      });
    });

    return Object.values(itemStats).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  // Busiest times heatmap data
  const busiestTimesData = useMemo(() => {
    const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));

    orders.forEach(order => {
      const date = new Date(order.created_at);
      const day = date.getDay();
      const hour = date.getHours();
      heatmap[day][hour]++;
    });

    // Find busiest day and hour
    let busiestDay = 0, busiestHour = 0, maxDayOrders = 0, maxHourOrders = 0;
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const hourTotals = Array(24).fill(0);

    heatmap.forEach((dayData, dayIdx) => {
      dayData.forEach((count, hourIdx) => {
        dayTotals[dayIdx] += count;
        hourTotals[hourIdx] += count;
      });
    });

    dayTotals.forEach((count, idx) => {
      if (count > maxDayOrders) { maxDayOrders = count; busiestDay = idx; }
    });
    hourTotals.forEach((count, idx) => {
      if (count > maxHourOrders) { maxHourOrders = count; busiestHour = idx; }
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return { heatmap, busiestDay: dayNames[busiestDay], busiestHour: `${busiestHour}:00`, peakOrders: Math.max(...heatmap.flat()), dayTotals, hourTotals };
  }, [orders]);

  // Customer analytics
  const customerAnalytics = useMemo(() => {
    const customerOrders: Record<string, { email: string; name: string; orders: number; totalSpend: number; firstOrder: string; lastOrder: string }> = {};

    orders.forEach(order => {
      const email = order.customer_email || 'unknown';
      if (!customerOrders[email]) {
        customerOrders[email] = { email, name: order.customer_name || 'Unknown', orders: 0, totalSpend: 0, firstOrder: order.created_at, lastOrder: order.created_at };
      }
      customerOrders[email].orders++;
      customerOrders[email].totalSpend += parseFloat(order.total_amount) || 0;
      if (order.created_at < customerOrders[email].firstOrder) customerOrders[email].firstOrder = order.created_at;
      if (order.created_at > customerOrders[email].lastOrder) customerOrders[email].lastOrder = order.created_at;
    });

    const allCustomers = Object.values(customerOrders);
    const oneTime = allCustomers.filter(c => c.orders === 1).length;
    const regular = allCustomers.filter(c => c.orders >= 2 && c.orders <= 5).length;
    const loyal = allCustomers.filter(c => c.orders > 5).length;
    const avgLTV = allCustomers.length > 0 ? allCustomers.reduce((sum, c) => sum + c.totalSpend, 0) / allCustomers.length : 0;

    return { customerOrders: allCustomers.sort((a, b) => b.totalSpend - a.totalSpend), oneTime, regular, loyal, avgLTV, total: allCustomers.length };
  }, [orders]);

  // Preference analytics
  const preferenceAnalytics = useMemo(() => {
    const stats = {
      starch: { None: 0, Light: 0, Medium: 0, Heavy: 0 } as Record<string, number>,
      finish: { 'On Hanger': 0, Folded: 0 } as Record<string, number>,
      detergent: { 'Standard Scent': 0, Unscented: 0, Hypoallergenic: 0 } as Record<string, number>,
      ecoOptions: { noPlastic: 0, recycleHangers: 0 },
      repairs: 0,
      totalWithPrefs: 0
    };

    orders.forEach(order => {
      if (order.preferences) {
        stats.totalWithPrefs++;
        const prefs = typeof order.preferences === 'string' ? JSON.parse(order.preferences) : order.preferences;
        if (prefs.starch && stats.starch[prefs.starch] !== undefined) stats.starch[prefs.starch]++;
        if (prefs.finish && stats.finish[prefs.finish] !== undefined) stats.finish[prefs.finish]++;
        if (prefs.detergent && stats.detergent[prefs.detergent] !== undefined) stats.detergent[prefs.detergent]++;
        if (prefs.no_plastic) stats.ecoOptions.noPlastic++;
        if (prefs.recycle_hangers) stats.ecoOptions.recycleHangers++;
        if (prefs.auth_repairs) stats.repairs++;
      }
    });

    return stats;
  }, [orders]);

  // Driver performance
  const driverPerformance = useMemo(() => {
    const driverStats: Record<string, { name: string; collections: number; deliveries: number; totalJobs: number }> = {};

    orders.forEach(order => {
      if (order.collection_driver?.name) {
        const name = order.collection_driver.name;
        if (!driverStats[name]) driverStats[name] = { name, collections: 0, deliveries: 0, totalJobs: 0 };
        driverStats[name].collections++;
        driverStats[name].totalJobs++;
      }
      if (order.delivery_driver?.name) {
        const name = order.delivery_driver.name;
        if (!driverStats[name]) driverStats[name] = { name, collections: 0, deliveries: 0, totalJobs: 0 };
        driverStats[name].deliveries++;
        driverStats[name].totalJobs++;
      }
    });

    return Object.values(driverStats).sort((a, b) => b.totalJobs - a.totalJobs);
  }, [orders]);

  // Revenue by day chart data
  const revenueByDay = useMemo(() => {
    const grouped = groupByDate(orders);
    return grouped.slice(-14).map(d => ({ label: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), value: d.total }));
  }, [orders]);

  // Export functions
  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).map(val => typeof val === 'object' ? JSON.stringify(val) : `"${val}"`).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const printReport = () => {
    window.print();
  };

  // Sidebar navigation items
  const navItems: { id: ReportView; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { id: 'revenue', icon: <TrendingUp size={18} />, label: 'Revenue' },
    { id: 'top-items', icon: <Shirt size={18} />, label: 'Top Items' },
    { id: 'busiest-times', icon: <Clock size={18} />, label: 'Busiest Times' },
    { id: 'customers', icon: <Users size={18} />, label: 'Customers' },
    { id: 'preferences', icon: <Settings size={18} />, label: 'Preferences' },
    { id: 'drivers', icon: <Truck size={18} />, label: 'Drivers' },
    { id: 'services', icon: <Layers size={18} />, label: 'Services' },
    { id: 'subscriptions', icon: <Repeat size={18} />, label: 'Subscriptions' },
  ];

  // Table sort handler
  const handleSort = (key: string) => {
    setTableSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[650px] -mx-4 sm:-mx-6 lg:-mx-8 rounded-xl overflow-hidden border border-gray-200">
      {/* Dark Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} bg-gray-900 text-white flex-shrink-0 transition-all duration-300 flex flex-col`}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          {!sidebarCollapsed && (
            <h3 className="font-bold text-sm flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-400" /> Reports
            </h3>
          )}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1 hover:bg-gray-800 rounded">
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveReport(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors text-sm ${
                activeReport === item.id ? 'bg-blue-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        {!sidebarCollapsed && (
          <div className="p-3 border-t border-gray-800">
            <div className="text-xs text-gray-500 mb-2">Quick Export</div>
            <div className="flex gap-2">
              <button onClick={printReport} className="flex-1 p-2 bg-gray-800 hover:bg-gray-700 rounded text-xs flex items-center justify-center gap-1">
                <Printer size={12} /> Print
              </button>
              <button onClick={() => exportToCSV(orders, 'orders')} className="flex-1 p-2 bg-gray-800 hover:bg-gray-700 rounded text-xs flex items-center justify-center gap-1">
                <Download size={12} /> CSV
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {/* Header with Date Range */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 capitalize">{activeReport.replace('-', ' ')} Report</h2>
            <p className="text-sm text-gray-500">
              {new Date(dateRange.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white border rounded-lg overflow-hidden">
              {(['week', 'month', 'quarter', 'year'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => handlePresetChange(p)}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${datePreset === p ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {p === 'week' ? '7D' : p === 'month' ? '30D' : p === 'quarter' ? '90D' : '1Y'}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => { setDateRange(r => ({ ...r, start: e.target.value })); setDatePreset('month'); }}
              className="border rounded-lg px-2 py-1.5 text-xs"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => { setDateRange(r => ({ ...r, end: e.target.value })); setDatePreset('month'); }}
              className="border rounded-lg px-2 py-1.5 text-xs"
            />
            {loading && <Loader2 size={18} className="animate-spin text-blue-600" />}
          </div>
        </div>

        {/* Dashboard View */}
        {activeReport === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard title="Total Revenue" value={formatCurrency(metrics.totalRevenue)} change={metrics.revenueChange} icon={<DollarSign size={20} className="text-green-600" />} color="green" />
              <KPICard title="Total Orders" value={metrics.totalOrders} change={metrics.ordersChange} icon={<Package size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Avg Order Value" value={formatCurrency(metrics.avgOrderValue)} icon={<Receipt size={20} className="text-purple-600" />} color="purple" />
              <KPICard title="Repeat Rate" value={`${metrics.repeatRate.toFixed(1)}%`} icon={<Repeat size={20} className="text-orange-600" />} color="orange" subtitle={`${metrics.uniqueCustomers} unique customers`} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Revenue Trend (Last 14 Days)</h3>
                <ReportLineChart data={revenueByDay} height={180} />
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Top 5 Services by Revenue</h3>
                <ReportBarChart data={topSellingItems.slice(0, 5).map(i => ({ label: i.name, value: i.revenue }))} height={180} />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Clock size={16} className="text-blue-500" /> Busiest Time</h3>
                <div className="text-2xl font-bold text-gray-900">{busiestTimesData.busiestDay}</div>
                <div className="text-sm text-gray-500">Peak hour: {busiestTimesData.busiestHour}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Shirt size={16} className="text-green-500" /> Top Item</h3>
                <div className="text-2xl font-bold text-gray-900">{topSellingItems[0]?.name || 'N/A'}</div>
                <div className="text-sm text-gray-500">{topSellingItems[0]?.quantity || 0} sold ({formatCurrency(topSellingItems[0]?.revenue || 0)})</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Heart size={16} className="text-red-500" /> Active Subscriptions</h3>
                <div className="text-2xl font-bold text-gray-900">{metrics.activeSubscriptions}</div>
                <div className="text-sm text-gray-500">Recurring customers</div>
              </div>
            </div>
          </div>
        )}

        {/* Revenue View */}
        {activeReport === 'revenue' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard title="Total Revenue" value={formatCurrency(metrics.totalRevenue)} change={metrics.revenueChange} icon={<DollarSign size={20} className="text-green-600" />} color="green" />
              <KPICard title="Total Orders" value={metrics.totalOrders} change={metrics.ordersChange} icon={<Package size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Avg Order Value" value={formatCurrency(metrics.avgOrderValue)} icon={<Target size={20} className="text-purple-600" />} color="purple" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Daily Revenue Trend</h3>
              <ReportLineChart data={revenueByDay} height={250} />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800">Orders Detail</h3>
                <button onClick={() => exportToCSV(orders, 'revenue_report')} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"><Download size={14} /> Export</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Order #</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.slice(0, 20).map(order => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-blue-600">#{order.readable_id}</td>
                        <td className="px-4 py-3 text-gray-700">{order.customer_name}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 capitalize">{order.status}</span></td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(parseFloat(order.total_amount) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Top Items View */}
        {activeReport === 'top-items' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <KPICard title="Total Items Sold" value={topSellingItems.reduce((s, i) => s + i.quantity, 0)} icon={<Package size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Top Item" value={topSellingItems[0]?.name || 'N/A'} icon={<Award size={20} className="text-orange-600" />} color="orange" subtitle={`${topSellingItems[0]?.quantity || 0} sold`} />
              <KPICard title="Items Revenue" value={formatCurrency(topSellingItems.reduce((s, i) => s + i.revenue, 0))} icon={<DollarSign size={20} className="text-green-600" />} color="green" />
              <KPICard title="Unique Items" value={topSellingItems.length} icon={<Layers size={20} className="text-purple-600" />} color="purple" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Top 10 Items by Revenue</h3>
              <ReportBarChart data={topSellingItems.slice(0, 10).map(i => ({ label: i.name, value: i.revenue, color: '#0056b3' }))} height={220} />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800">All Items Performance</h3>
                <input type="text" placeholder="Search items..." value={tableSearchTerm} onChange={(e) => setTableSearchTerm(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm w-48" />
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>Item Name {tableSortConfig?.key === 'name' && (tableSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('quantity')}>Qty Sold {tableSortConfig?.key === 'quantity' && (tableSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('revenue')}>Revenue {tableSortConfig?.key === 'revenue' && (tableSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Avg Price</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topSellingItems
                      .filter(i => i.name.toLowerCase().includes(tableSearchTerm.toLowerCase()))
                      .sort((a, b) => {
                        if (!tableSortConfig) return 0;
                        const aVal = a[tableSortConfig.key as keyof typeof a];
                        const bVal = b[tableSortConfig.key as keyof typeof b];
                        return tableSortConfig.direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                      })
                      .map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(item.revenue)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(item.quantity > 0 ? item.revenue / item.quantity : 0)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{item.orders}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Busiest Times View */}
        {activeReport === 'busiest-times' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard title="Busiest Day" value={busiestTimesData.busiestDay} icon={<CalendarDays size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Peak Hour" value={busiestTimesData.busiestHour} icon={<Clock size={20} className="text-orange-600" />} color="orange" />
              <KPICard title="Peak Orders/Hour" value={busiestTimesData.peakOrders} icon={<TrendingUp size={20} className="text-green-600" />} color="green" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-2">Weekly Order Heatmap</h3>
              <p className="text-sm text-gray-500 mb-4">Darker colors indicate higher order volumes</p>
              <ReportHeatmap data={busiestTimesData.heatmap} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Orders by Day of Week</h3>
                <ReportBarChart data={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => ({ label: d, value: busiestTimesData.dayTotals[i] }))} height={180} />
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Hourly Distribution (Business Hours)</h3>
                <ReportBarChart data={busiestTimesData.hourTotals.slice(7, 20).map((v, i) => ({ label: `${i + 7}h`, value: v }))} height={180} barColor="#10b981" />
              </div>
            </div>
          </div>
        )}

        {/* Customers View */}
        {activeReport === 'customers' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <KPICard title="Total Customers" value={customerAnalytics.total} icon={<Users size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Repeat Rate" value={`${metrics.repeatRate.toFixed(1)}%`} icon={<Repeat size={20} className="text-green-600" />} color="green" />
              <KPICard title="Avg Lifetime Value" value={formatCurrency(customerAnalytics.avgLTV)} icon={<Target size={20} className="text-purple-600" />} color="purple" />
              <KPICard title="Loyal Customers" value={customerAnalytics.loyal} icon={<Heart size={20} className="text-red-600" />} color="red" subtitle="6+ orders" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Customer Segments</h3>
                <ReportDonutChart
                  data={[
                    { label: 'One-time', value: customerAnalytics.oneTime, color: '#94a3b8' },
                    { label: 'Regular (2-5)', value: customerAnalytics.regular, color: '#3b82f6' },
                    { label: 'Loyal (6+)', value: customerAnalytics.loyal, color: '#10b981' }
                  ]}
                  centerValue={customerAnalytics.total}
                  centerLabel="Total"
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Top Customers by Spend</h3>
                <ReportBarChart data={customerAnalytics.customerOrders.slice(0, 8).map(c => ({ label: c.name.split(' ')[0], value: c.totalSpend }))} height={180} barColor="#8b5cf6" />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Customer Details</h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Orders</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Total Spend</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">First Order</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Last Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customerAnalytics.customerOrders.slice(0, 20).map((c, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3"><div className="font-medium text-gray-800">{c.name}</div><div className="text-xs text-gray-500">{c.email}</div></td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-700">{c.orders}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(c.totalSpend)}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(c.firstOrder).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(c.lastOrder).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Preferences View */}
        {activeReport === 'preferences' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <Info size={20} className="text-blue-600" />
              <p className="text-sm text-blue-800">Preference data from <strong>{preferenceAnalytics.totalWithPrefs}</strong> orders with recorded preferences.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Starch Level</h4>
                <ReportDonutChart
                  data={Object.entries(preferenceAnalytics.starch).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v, color: k === 'None' ? '#94a3b8' : k === 'Light' ? '#93c5fd' : k === 'Medium' ? '#3b82f6' : '#1d4ed8' }))}
                  size={120}
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Finish Style</h4>
                <ReportDonutChart
                  data={Object.entries(preferenceAnalytics.finish).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v, color: k === 'On Hanger' ? '#10b981' : '#f59e0b' }))}
                  size={120}
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Detergent Choice</h4>
                <ReportDonutChart
                  data={Object.entries(preferenceAnalytics.detergent).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v, color: k === 'Standard Scent' ? '#8b5cf6' : k === 'Unscented' ? '#94a3b8' : '#ec4899' }))}
                  size={120}
                />
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Eco & Care Options</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm"><Leaf className="text-green-500" size={16} /> No Plastic</span>
                    <span className="font-bold text-gray-800">{preferenceAnalytics.ecoOptions.noPlastic}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm"><RefreshCw className="text-green-500" size={16} /> Recycle Hangers</span>
                    <span className="font-bold text-gray-800">{preferenceAnalytics.ecoOptions.recycleHangers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm"><Scissors className="text-blue-500" size={16} /> Auth Repairs</span>
                    <span className="font-bold text-gray-800">{preferenceAnalytics.repairs}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drivers View */}
        {activeReport === 'drivers' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard title="Active Drivers" value={driverPerformance.length} icon={<Truck size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Total Jobs" value={driverPerformance.reduce((s, d) => s + d.totalJobs, 0)} icon={<Package size={20} className="text-green-600" />} color="green" />
              <KPICard title="Top Performer" value={driverPerformance[0]?.name || 'N/A'} icon={<Award size={20} className="text-orange-600" />} color="orange" subtitle={`${driverPerformance[0]?.totalJobs || 0} jobs`} />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Driver Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Driver</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Collections</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Deliveries</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Total Jobs</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Performance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {driverPerformance.map((driver, idx) => {
                      const maxJobs = driverPerformance[0]?.totalJobs || 1;
                      const performancePercent = (driver.totalJobs / maxJobs) * 100;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold text-gray-800">{driver.name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{driver.collections}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{driver.deliveries}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{driver.totalJobs}</td>
                          <td className="px-4 py-3">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${performancePercent}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Services View */}
        {activeReport === 'services' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard title="Total Services Sold" value={topSellingItems.reduce((s, i) => s + i.quantity, 0)} icon={<Layers size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Service Revenue" value={formatCurrency(topSellingItems.reduce((s, i) => s + i.revenue, 0))} icon={<DollarSign size={20} className="text-green-600" />} color="green" />
              <KPICard title="Unique Services" value={topSellingItems.length} icon={<Shirt size={20} className="text-purple-600" />} color="purple" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Service Category Performance</h3>
              <ReportBarChart data={topSellingItems.slice(0, 12).map(i => ({ label: i.name, value: i.revenue }))} height={220} />
            </div>
          </div>
        )}

        {/* Subscriptions View */}
        {activeReport === 'subscriptions' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <KPICard title="Active Subscriptions" value={metrics.activeSubscriptions} icon={<Repeat size={20} className="text-green-600" />} color="green" />
              <KPICard title="Paused" value={customers.filter(c => c.subscription_paused).length} icon={<Pause size={20} className="text-orange-600" />} color="orange" />
              <KPICard title="Weekly" value={customers.filter(c => c.subscription_frequency === 'weekly').length} icon={<CalendarDays size={20} className="text-blue-600" />} color="blue" />
              <KPICard title="Monthly" value={customers.filter(c => c.subscription_frequency === 'monthly').length} icon={<Calendar size={20} className="text-purple-600" />} color="purple" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Subscription Distribution</h3>
              <ReportDonutChart
                data={[
                  { label: 'Weekly', value: customers.filter(c => c.subscription_frequency === 'weekly' && !c.subscription_paused).length, color: '#3b82f6' },
                  { label: 'Fortnightly', value: customers.filter(c => c.subscription_frequency === 'fortnightly' && !c.subscription_paused).length, color: '#8b5cf6' },
                  { label: 'Monthly', value: customers.filter(c => c.subscription_frequency === 'monthly' && !c.subscription_paused).length, color: '#10b981' },
                  { label: 'Paused', value: customers.filter(c => c.subscription_paused).length, color: '#94a3b8' }
                ].filter(d => d.value > 0)}
                centerValue={metrics.activeSubscriptions}
                centerLabel="Active"
                size={180}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {orders.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <FileText size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Data Available</h3>
            <p className="text-gray-500">No orders found for the selected date range. Try adjusting your filters.</p>
          </div>
        )}
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          main { margin: 0; padding: 20px; overflow: visible !important; height: auto !important; }
          .bg-gray-50 { background: white !important; }
        }
      `}</style>

      {/* Collection Failed Modal */}
      {showCollectionFailedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <XCircle size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Collection Failed</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customer or order not ready</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Reason for Failed Collection *
              </label>
              <select
                value={collectionFailedReason}
                onChange={(e) => setCollectionFailedReason(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm dark:bg-gray-700 dark:text-white mb-2"
              >
                <option value="">Select a reason...</option>
                <option value="Customer not home">Customer not home</option>
                <option value="Customer not ready">Customer not ready</option>
                <option value="Wrong address">Wrong address</option>
                <option value="Customer cancelled">Customer cancelled</option>
                <option value="Access issues">Access issues (gate/building)</option>
                <option value="Customer rescheduled">Customer rescheduled</option>
                <option value="Other">Other (specify below)</option>
              </select>
              {collectionFailedReason === 'Other' && (
                <textarea
                  value=""
                  onChange={(e) => setCollectionFailedReason(e.target.value)}
                  placeholder="Please specify the reason..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm dark:bg-gray-700 dark:text-white"
                  rows={3}
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCollectionFailedModal(false);
                  setCollectionFailedOrderId(null);
                  setCollectionFailedReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCollectionFailed}
                disabled={!collectionFailedReason}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Mark as Failed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DriverPortalPage: React.FC<{ driver: any; onLogout: () => void; darkMode: boolean; toggleDark: () => void }> = ({ driver, onLogout, darkMode, toggleDark }) => {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [podPhoto, setPodPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showCollectionFailedModal, setShowCollectionFailedModal] = useState(false);
  const [collectionFailedReason, setCollectionFailedReason] = useState('');
  const [collectionFailedOrderId, setCollectionFailedOrderId] = useState<string | null>(null);

  useEffect(() => {
    fetchDeliveries();
  }, [driver]);

  // Real-time subscription for order updates
  useEffect(() => {
    if (!driver || !driver.id) return;

    console.log('--- DRIVER: SETTING UP REALTIME SUBSCRIPTION FOR ORDERS ---');

    // Subscribe to changes in the cp_orders table
    const ordersSubscription = supabase
      .channel('driver-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events: INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'cp_orders'
        },
        (payload) => {
          console.log('Driver: Order change detected:', payload);
          // Refresh deliveries when any change occurs
          fetchDeliveries();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      console.log('--- DRIVER: CLEANING UP REALTIME SUBSCRIPTION ---');
      supabase.removeChannel(ordersSubscription);
    };
  }, [driver]);

  const fetchDeliveries = async () => {
    if (!driver || !driver.id) return;

    // Fetch orders where this driver is assigned
    // For collection: show if status is dispatched, collecting, or pending collection
    // For delivery: show if status is ready_for_delivery, out_for_delivery, or delivered (not completed)
    const { data, error } = await supabase
      .from('cp_orders')
      .select('*, items:cp_order_items(*)')
      .eq('tenant_id', driver.tenant_id)
      .or(`collection_driver_id.eq.${driver.id},delivery_driver_id.eq.${driver.id}`)
      .not('status', 'eq', 'completed')
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Filter to show only relevant tasks based on order status
      const relevantDeliveries = data.filter(order => {
        // If driver is assigned for collection and order is in collection phase
        const isCollectionDriver = order.collection_driver_id === driver.id;
        const isDeliveryDriver = order.delivery_driver_id === driver.id;

        // Collection phase: pending, dispatched, collecting (not yet collected)
        const inCollectionPhase = ['pending', 'dispatched', 'collecting'].includes(order.status);

        // Delivery phase: ready_for_delivery, out_for_delivery, delivered (not completed)
        const inDeliveryPhase = ['ready_for_delivery', 'out_for_delivery', 'delivered'].includes(order.status);

        // Show if:
        // - Driver is collection driver AND order is in collection phase
        // - Driver is delivery driver AND order is in delivery phase
        return (isCollectionDriver && inCollectionPhase) || (isDeliveryDriver && inDeliveryPhase);
      });

      setDeliveries(relevantDeliveries);
    }
  };

  const updateDeliveryStatus = async (orderId: string, status: string, isCollection: boolean) => {
    const updates: any = {};

    if (isCollection) {
      updates.collection_status = status;
      if (status === 'collected') {
        updates.collected_at = new Date().toISOString();
        updates.status = 'collected';
      } else if (status === 'collecting') {
        updates.status = 'collecting';
      } else if (status === 'dispatched') {
        updates.status = 'dispatched';
      }
    } else {
      updates.delivery_status = status;
      if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString();
        updates.status = 'delivered';
      } else if (status === 'out_for_delivery') {
        updates.status = 'out_for_delivery';
      } else if (status === 'completed') {
        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
      }
    }

    const { error } = await supabase
      .from('cp_orders')
      .update(updates)
      .eq('id', orderId);

    if (!error) {
      fetchDeliveries();
      if (status === 'collected') {
        alert('Collection completed!');
        setSelectedDelivery(null);
      } else if (status === 'delivered') {
        alert('Delivery completed! You can now mark as completed.');
        // Don't clear selection - allow driver to mark as completed
      } else if (status === 'completed') {
        alert('Order marked as completed!');
        setSelectedDelivery(null);
      }
    }
  };

  const openCollectionFailedModal = (orderId: string) => {
    setCollectionFailedOrderId(orderId);
    setCollectionFailedReason('');
    setShowCollectionFailedModal(true);
  };

  const handleCollectionFailed = async () => {
    if (!collectionFailedOrderId || !collectionFailedReason.trim()) {
      alert('Please provide a reason for the failed collection.');
      return;
    }

    const { error } = await supabase
      .from('cp_orders')
      .update({
        status: 'collection_failed',
        collection_status: 'collection_failed',
        collection_failed_reason: collectionFailedReason.trim(),
        collection_failed_at: new Date().toISOString()
      })
      .eq('id', collectionFailedOrderId);

    if (!error) {
      alert('Collection marked as failed. The order has been flagged for follow-up.');
      setShowCollectionFailedModal(false);
      setCollectionFailedOrderId(null);
      setCollectionFailedReason('');
      setSelectedDelivery(null);
      fetchDeliveries();
    } else {
      alert('Error updating order: ' + error.message);
    }
  };

  const uploadPOD = async () => {
    if (!selectedDelivery || !podPhoto) return;

    setUploading(true);

    // Upload photo to Supabase Storage
    const fileExt = podPhoto.name.split('.').pop();
    const fileName = `${selectedDelivery.id}_${Date.now()}.${fileExt}`;
    const filePath = `pod-photos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('delivery-photos')
      .upload(filePath, podPhoto);

    if (uploadError) {
      alert('Error uploading photo: ' + uploadError.message);
      setUploading(false);
      return;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('delivery-photos')
      .getPublicUrl(filePath);

    // Save to database
    await supabase.from('cp_delivery_photos').insert([{
      order_id: selectedDelivery.id,
      driver_id: driver.id,
      photo_url: publicUrl,
      photo_type: 'pod'
    }]);

    // Determine if this is a collection or delivery
    const isCollection = selectedDelivery.collection_driver_id === driver.id;
    const statusField = isCollection ? 'collection_photo_url' : 'pod_photo_url';
    const notesField = isCollection ? 'collection_notes' : 'delivery_notes';

    // Update order with photo and notes
    await supabase
      .from('cp_orders')
      .update({ [statusField]: publicUrl, [notesField]: deliveryNotes })
      .eq('id', selectedDelivery.id);

    // Mark as completed (collected or delivered)
    const completionStatus = isCollection ? 'collected' : 'delivered';
    await updateDeliveryStatus(selectedDelivery.id, completionStatus, isCollection);

    setUploading(false);
    setPodPhoto(null);
    setDeliveryNotes('');
  };

  // Generate Google Maps URL with all delivery stops
  const getMapUrl = () => {
    if (deliveries.length === 0) return '';

    const addresses = deliveries.map(d => encodeURIComponent(d.customer_address)).join('/');
    return `https://www.google.com/maps/dir/${addresses}`;
  };

  return (
    <div className="pt-10 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 dark:text-gray-100 transition-colors">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Driver Portal</h1>
          <p className="text-gray-600">Welcome, {driver?.name || 'Driver'}</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle darkMode={darkMode} toggle={toggleDark} />
          <button
            onClick={onLogout}
            className="px-4 py-2 rounded-lg font-bold flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition"
          >
            <LogOut size={18} /> Logout
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${viewMode === 'list' ? 'bg-trust-blue text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
            >
              <ShoppingBag size={18} /> List
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${viewMode === 'map' ? 'bg-trust-blue text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
            >
              <MapPin size={18} /> Map
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Delivery List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="font-bold text-lg mb-4">Today's Deliveries ({deliveries.length})</h2>

              {deliveries.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Truck size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No deliveries assigned</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deliveries.map((delivery, index) => {
                    // Determine if this is a collection or delivery based on order workflow stage
                    // Collection phase: pending, dispatched, collecting
                    // Delivery phase: ready_for_delivery, out_for_delivery, delivered
                    const inCollectionPhase = ['pending', 'dispatched', 'collecting'].includes(delivery.status);
                    const isCollection = inCollectionPhase;
                    const orderType = isCollection ? 'COLLECTION' : 'DELIVERY';
                    const currentStatus = isCollection ? (delivery.collection_status || delivery.status) : (delivery.delivery_status || delivery.status);

                    // Color coding: Blue for collection, Green for delivery
                    const typeColor = isCollection ? 'bg-blue-500' : 'bg-green-500';
                    const typeBg = isCollection ? 'bg-blue-50' : 'bg-green-50';
                    const typeBorder = isCollection ? 'border-blue-200' : 'border-green-200';

                    return (
                      <div
                        key={delivery.id}
                        onClick={() => setSelectedDelivery(delivery)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition ${selectedDelivery?.id === delivery.id
                          ? `${typeBorder} ${isCollection ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-green-50 dark:bg-green-900/20'}`
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                          }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full ${typeColor} text-white flex items-center justify-center font-bold`}>
                              {index + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold">{delivery.customer_name}</h3>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isCollection ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                  {orderType}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">#{delivery.readable_id}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${currentStatus === 'collected' || currentStatus === 'delivered' ? 'bg-green-100 text-green-700' :
                            currentStatus === 'collecting' || currentStatus === 'out_for_delivery' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                            {currentStatus || 'pending'}
                          </span>
                        </div>

                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                          <span>{delivery.customer_address}</span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                          <Phone size={16} />
                          <span>{delivery.customer_phone}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Delivery Details & POD */}
          <div className="lg:col-span-1">
            {selectedDelivery ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 sticky top-32">
                <h3 className="font-bold text-lg mb-4">Order Details</h3>

                {(() => {
                  // Determine if this is a collection or delivery based on order workflow stage
                  const inCollectionPhase = ['pending', 'dispatched', 'collecting'].includes(selectedDelivery.status);
                  const isCollection = inCollectionPhase;
                  const orderType = isCollection ? 'COLLECTION' : 'DELIVERY';
                  const currentStatus = isCollection ? (selectedDelivery.collection_status || selectedDelivery.status) : (selectedDelivery.delivery_status || selectedDelivery.status);
                  const isCompleted = currentStatus === 'collected' || currentStatus === 'delivered';

                  return (
                    <>
                      <div className={`mb-4 p-3 rounded-lg ${isCollection ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'}`}>
                        <div className="text-center">
                          <span className={`text-xs font-bold ${isCollection ? 'text-blue-700' : 'text-green-700'}`}>
                            {orderType}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 mb-6">
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Customer</label>
                          <p className="font-bold">{selectedDelivery.customer_name}</p>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Address</label>
                          <p className="text-sm">{selectedDelivery.customer_address}</p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedDelivery.customer_address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-trust-blue text-xs font-bold hover:underline flex items-center gap-1 mt-1"
                          >
                            <MapPin size={12} /> Open in Maps
                          </a>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
                          <p className="text-sm">{selectedDelivery.customer_phone}</p>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Order Items</label>
                          <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
                            {selectedDelivery.items && selectedDelivery.items.length > 0 ? (
                              selectedDelivery.items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                                  <span className="font-medium text-gray-800 dark:text-gray-200">{item.quantity}x {item.name}</span>
                                  {item.price_numeric && <span className="text-trust-blue font-bold text-xs">£{(item.price_numeric * item.quantity).toFixed(2)}</span>}
                                </div>
                              ))
                            ) : (
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg">
                                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium italic italic flex items-center gap-2">
                                  <Info size={14} /> General Valet Order (Items to be added at shop)
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {!isCompleted && (
                        <>
                          <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                              {isCollection ? 'Collection Notes' : 'Delivery Notes'}
                            </label>
                            <textarea
                              value={deliveryNotes}
                              onChange={(e) => setDeliveryNotes(e.target.value)}
                              className="w-full border rounded-lg p-2 text-sm"
                              rows={3}
                              placeholder={`Add any ${isCollection ? 'collection' : 'delivery'} notes...`}
                            />
                          </div>

                          <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                              {isCollection ? 'Collection Photo' : 'POD Photo'}
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => setPodPhoto(e.target.files?.[0] || null)}
                              className="w-full text-sm"
                            />
                            {podPhoto && (
                              <p className="text-xs text-green-600 mt-1">✓ Photo selected: {podPhoto.name}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            {currentStatus === 'pending' && (
                              <button
                                onClick={() => updateDeliveryStatus(
                                  selectedDelivery.id,
                                  isCollection ? 'collecting' : 'out_for_delivery',
                                  isCollection
                                )}
                                className="w-full bg-blue-500 text-white py-2 rounded-lg font-bold hover:bg-blue-600"
                              >
                                {isCollection ? 'Start Collection' : 'Start Delivery'}
                              </button>
                            )}

                            <button
                              onClick={uploadPOD}
                              disabled={!podPhoto || uploading}
                              className="w-full bg-green-500 text-white py-2 rounded-lg font-bold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {uploading ? 'Uploading...' : (isCollection ? 'Complete Collection' : 'Complete Delivery')}
                            </button>

                            {/* Customer/Order Not Ready - Collection Failed */}
                            {isCollection && (
                              <button
                                onClick={() => openCollectionFailedModal(selectedDelivery.id)}
                                className="w-full bg-red-500 text-white py-2 rounded-lg font-bold hover:bg-red-600 flex items-center justify-center gap-2"
                              >
                                <XCircle size={18} />
                                Customer/Order Not Ready
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {isCompleted && (
                        <>
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center mb-4">
                            <Check size={48} className="mx-auto text-green-600 mb-2" />
                            <p className="font-bold text-green-700">
                              {isCollection ? 'Collection Completed!' : 'Delivery Completed!'}
                            </p>
                          </div>

                          {/* Allow driver to mark as completed after delivery */}
                          {!isCollection && selectedDelivery.status === 'delivered' && (
                            <button
                              onClick={() => updateDeliveryStatus(selectedDelivery.id, 'completed', false)}
                              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 flex items-center justify-center gap-2"
                            >
                              <CheckCircle2 size={20} />
                              Mark Order as Completed
                            </button>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-500">
                <p>Select a delivery to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Map View */
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">Route Map</h2>
            <a
              href={getMapUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-trust-blue text-white px-4 py-2 rounded-lg font-bold hover:bg-trust-blue-hover flex items-center gap-2 text-sm"
            >
              <MapPin size={16} /> Open in Google Maps
            </a>
          </div>

          {deliveries.length > 0 ? (
            <div>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-trust-blue">{deliveries.length}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Total Stops</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {deliveries.filter(d => d.delivery_status === 'delivered' || d.collection_status === 'collected').length}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Completed</div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {deliveries.filter(d => d.delivery_status !== 'delivered' && d.collection_status !== 'collected').length}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Pending</div>
                </div>
              </div>

              {/* Interactive Leaflet Map */}
              <DeliveryMap
                deliveries={deliveries.map(d => ({
                  id: d.id,
                  customer_name: d.customer_name,
                  customer_address: d.customer_address,
                  status: d.collection_driver_id === driver.id ? d.collection_status : d.delivery_status
                }))}
                onMarkerClick={(delivery) => {
                  const fullDelivery = deliveries.find(d => d.id === delivery.id);
                  if (fullDelivery) {
                    setSelectedDelivery(fullDelivery);
                    setViewMode('list'); // Switch to list view to show details
                  }
                }}
                selectedDeliveryId={selectedDelivery?.id}
              />

              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                  💡 <strong>Tip:</strong> Click on any marker to view delivery details, or use "Open in Google Maps" for turn-by-turn navigation
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <MapPin size={48} className="mx-auto mb-4 opacity-20" />
              <p>No deliveries to map</p>
            </div>
          )}
        </div>
      )}

      {/* Collection Failed Modal */}
      {showCollectionFailedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <XCircle size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Collection Failed</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customer or order not ready</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Reason for Failed Collection *
              </label>
              <select
                value={collectionFailedReason}
                onChange={(e) => setCollectionFailedReason(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm dark:bg-gray-700 dark:text-white mb-2"
              >
                <option value="">Select a reason...</option>
                <option value="Customer not home">Customer not home</option>
                <option value="Customer not ready">Customer not ready</option>
                <option value="Wrong address">Wrong address</option>
                <option value="Customer cancelled">Customer cancelled</option>
                <option value="Access issues">Access issues (gate/building)</option>
                <option value="Customer rescheduled">Customer rescheduled</option>
                <option value="Other">Other (specify below)</option>
              </select>
              {collectionFailedReason === 'Other' && (
                <textarea
                  value=""
                  onChange={(e) => setCollectionFailedReason(e.target.value)}
                  placeholder="Please specify the reason..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm dark:bg-gray-700 dark:text-white"
                  rows={3}
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCollectionFailedModal(false);
                  setCollectionFailedOrderId(null);
                  setCollectionFailedReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCollectionFailed}
                disabled={!collectionFailedReason}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Mark as Failed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Track Order Page Component
const TrackOrderPage: React.FC = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const trackOrder = async () => {
    if (!orderNumber.trim()) {
      setError('Please enter an order number');
      return;
    }

    setLoading(true);
    setError('');
    setOrder(null);

    try {
      // Search by readable_id (e.g., #HOFN, #Q1AM)
      const searchId = orderNumber.trim().toUpperCase().replace('#', '');
      console.log('Tracking order:', searchId);

      const { data, error: fetchError } = await supabase
        .from('cp_orders')
        .select('*')
        .eq('readable_id', searchId)
        .maybeSingle();

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        setError('An error occurred while fetching the order.');
      } else if (!data) {
        setError(`Order ${orderNumber} not found. Please double check the order number.`);
      } else {
        console.log('Order found:', data);
        setOrder(data);
      }
    } catch (err) {
      console.error('Tracking crash:', err);
      setError('An error occurred while tracking your order.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    const statusMap: { [key: string]: { label: string; color: string; icon: any; description: string } } = {
      pending: { label: 'Order Received', color: 'yellow', icon: Package, description: 'Your order has been received and is being processed' },
      dispatched: { label: 'Driver Dispatched', color: 'blue', icon: Truck, description: 'A driver has been dispatched to collect your items' },
      collecting: { label: 'Collecting Items', color: 'blue', icon: Package, description: 'Driver is collecting your items' },
      collection_failed: { label: 'Collection Failed', color: 'red', icon: XCircle, description: 'Collection was unsuccessful - customer or order not ready' },
      collected: { label: 'Items Collected', color: 'indigo', icon: Check, description: 'Your items have been collected successfully' },
      cleaning: { label: 'In Cleaning', color: 'purple', icon: Shirt, description: 'Your items are being cleaned and processed' },
      ready_for_delivery: { label: 'Ready for Delivery', color: 'orange', icon: PackageCheck, description: 'Your items are cleaned and ready for delivery' },
      out_for_delivery: { label: 'Out for Delivery', color: 'cyan', icon: Truck, description: 'Your items are on the way to you' },
      delivered: { label: 'Delivered', color: 'teal', icon: CheckCircle, description: 'Your items have been delivered' },
      completed: { label: 'Completed', color: 'green', icon: CheckCircle2, description: 'Order completed successfully' },
    };
    return statusMap[status] || { label: status, color: 'gray', icon: Package, description: '' };
  };

  const getProgressPercentage = (status: string) => {
    if (status === 'collection_failed') return 33; // Collection phase percentage
    const stages = ['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'];
    const currentIndex = stages.indexOf(status);
    return ((currentIndex + 1) / stages.length) * 100;
  };

  const statusInfo = order ? getStatusInfo(order.status) : null;
  const Icon = statusInfo?.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-trust-blue rounded-full mb-4">
            <Search size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Track Your Order</h1>
          <p className="text-gray-600 dark:text-gray-400">Enter your order number to see the current status</p>
        </div>

        {/* Search Box */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Order Number / Ticket ID
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && trackOrder()}
                placeholder="e.g., HOFN or #HOFN"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-trust-blue dark:bg-gray-700 dark:text-white outline-none transition text-lg font-mono uppercase"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                💡 You can find your order number (e.g. #UA2Y) in your confirmation email
              </p>
            </div>
            <div className="sm:pt-7">
              <button
                onClick={trackOrder}
                disabled={loading}
                className="w-full sm:w-auto bg-trust-blue text-white px-8 py-3 rounded-lg font-bold hover:bg-trust-blue-hover disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Tracking...
                  </>
                ) : (
                  <>
                    <Search size={20} />
                    Track Status
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Order Details */}
        {order && statusInfo && Icon && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Order #{order.readable_id}</h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Placed on {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className={`p-4 rounded-full bg-${statusInfo.color}-100 dark:bg-${statusInfo.color}-900/20`}>
                  <Icon size={32} className={`text-${statusInfo.color}-600 dark:text-${statusInfo.color}-400`} />
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{statusInfo.label}</span>
                  <span className="text-sm font-bold text-trust-blue">{Math.round(getProgressPercentage(order.status))}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-trust-blue to-eco-green h-full rounded-full transition-all duration-500"
                    style={{ width: `${getProgressPercentage(order.status)}%` }}
                  />
                </div>
              </div>

              <p className="text-gray-600 dark:text-gray-400">{statusInfo.description}</p>
            </div>

            {/* Collection Failed Alert */}
            {order.status === 'collection_failed' && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl shadow-xl p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                    <XCircle size={24} className="text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-800 dark:text-red-200 mb-1">Collection Unsuccessful</h3>
                    <p className="text-red-700 dark:text-red-300 mb-2">
                      Our driver was unable to complete the collection for this order.
                    </p>
                    {order.collection_failed_reason && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        <span className="font-bold">Reason:</span> {order.collection_failed_reason}
                      </p>
                    )}
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      Our team will contact you to reschedule the collection.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <h3 className="text-xl font-bold mb-6">Order Timeline</h3>
              <div className="space-y-4">
                {['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].map((stage, index) => {
                  const stageInfo = getStatusInfo(stage);
                  const StageIcon = stageInfo.icon;
                  const isCompleted = ['pending', 'dispatched', 'collecting', 'collected', 'cleaning', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].indexOf(order.status) >= index;
                  const isCurrent = order.status === stage;

                  return (
                    <div key={stage} className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCurrent ? `bg-${stageInfo.color}-500 ring-4 ring-${stageInfo.color}-200 dark:ring-${stageInfo.color}-900/50` :
                          isCompleted ? `bg-${stageInfo.color}-500` :
                            'bg-gray-200 dark:bg-gray-700'
                          }`}>
                          <StageIcon size={20} className={isCompleted ? 'text-white' : 'text-gray-400'} />
                        </div>
                        {index < 8 && (
                          <div className={`w-0.5 h-8 ${isCompleted ? `bg-${stageInfo.color}-500` : 'bg-gray-200 dark:bg-gray-700'
                            }`} />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <h4 className={`font-bold ${isCurrent ? `text-${stageInfo.color}-600 dark:text-${stageInfo.color}-400` :
                          isCompleted ? 'text-gray-900 dark:text-gray-100' :
                            'text-gray-400 dark:text-gray-600'
                          }`}>
                          {stageInfo.label}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{stageInfo.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Delivery Information */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <h3 className="text-xl font-bold mb-6">Delivery Information</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Customer Name</h4>
                  <p className="text-gray-900 dark:text-gray-100">{order.customer_name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Delivery Address</h4>
                  <p className="text-gray-900 dark:text-gray-100">{order.customer_address}</p>
                </div>
                {order.customer_phone && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Phone Number</h4>
                    <p className="text-gray-900 dark:text-gray-100">{order.customer_phone}</p>
                  </div>
                )}
                {order.delivery_slot && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Delivery Slot</h4>
                    <p className="text-gray-900 dark:text-gray-100">{order.delivery_slot}</p>
                  </div>
                )}
              </div>
            </div>

            {/* POD and Collection Photos */}
            {(order.pod_photo_url || order.collection_photo_url) && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Search size={24} className="text-trust-blue" />
                  Order Photos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {order.collection_photo_url && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                        <Package size={18} className="text-blue-600" />
                        Collection Photo
                      </h4>
                      <div className="relative group overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                        <img
                          src={order.collection_photo_url}
                          alt="Collection proof"
                          className="w-full h-64 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                          onClick={() => window.open(order.collection_photo_url, '_blank')}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                          <Search size={48} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      {order.collection_notes && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 italic">"{order.collection_notes}"</p>
                      )}
                      {order.collected_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Collected: {new Date(order.collected_at).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  {order.pod_photo_url && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                        <CheckCircle size={18} className="text-green-600" />
                        Proof of Delivery
                      </h4>
                      <div className="relative group overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                        <img
                          src={order.pod_photo_url}
                          alt="Proof of delivery"
                          className="w-full h-64 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                          onClick={() => window.open(order.pod_photo_url, '_blank')}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                          <Search size={48} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      {order.delivery_notes && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 italic">"{order.delivery_notes}"</p>
                      )}
                      {order.delivered_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Delivered: {new Date(order.delivered_at).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-6 text-center">
                  💡 Click on any photo to view full size
                </p>
              </div>
            )}

            {/* Help Section */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Info size={24} className="text-trust-blue flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Need Help?</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    If you have any questions about your order, please contact us:
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <a href="tel:01234567890" className="flex items-center gap-2 text-trust-blue hover:underline">
                      <Phone size={16} />
                      01234 567890
                    </a>
                    <a href="mailto:info@class1cleaners.com" className="flex items-center gap-2 text-trust-blue hover:underline">
                      <Mail size={16} />
                      info@class1cleaners.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- SaaS Components ---

const PartnerLoginModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [subdomain, setSubdomain] = useState('');
  const [error, setError] = useState('');

  const handleGoToStore = () => {
    if (!subdomain) {
      setError('Please enter your store name');
      return;
    }
    const cleanSubdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';

    // Use tenant query parameter for compatibility with Firebase hosting (no subdomain support)
    window.location.href = `${window.location.origin}/back-office?tenant=${cleanSubdomain}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative animate-scale-in">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10">
          <X size={20} />
        </button>

        <div className="p-8 pt-12">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Settings size={32} className="text-trust-blue" />
          </div>

          <h3 className="text-2xl font-bold text-center mb-2">Partner Login</h3>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-8">Enter your store's name to access your back office</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Store Name / Subdomain</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="your-store"
                  className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none font-bold text-lg"
                  value={subdomain}
                  onChange={e => { setSubdomain(e.target.value); setError(''); }}
                />
                <span className="text-gray-400 font-bold">.cleanpos.app</span>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}

            <button
              onClick={handleGoToStore}
              className="w-full py-4 bg-trust-blue text-white rounded-xl font-bold text-lg hover:bg-trust-blue-hover transition shadow-lg flex items-center justify-center gap-2"
            >
              Go to Back Office <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SaaSPage: React.FC<{
  onSignUp: () => void;
  onPartnerLogin: () => void;
  user?: any;
  onLogout?: () => void;
  onGoToDashboard?: () => void;
}> = ({ onSignUp, onPartnerLogin, user, onLogout, onGoToDashboard }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 font-sans">
      {/* SaaS Navigation */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-trust-blue rounded-xl flex items-center justify-center">
              <Sparkles size={24} className="text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-gray-900 dark:text-white">CleanPOS</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <button onClick={onGoToDashboard} className="text-trust-blue font-bold px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition">Go to Dashboard</button>
                <button onClick={onLogout} className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-6 py-2.5 rounded-full font-bold hover:bg-red-100 transition shadow-sm">Logout</button>
              </>
            ) : (
              <>
                <button onClick={onPartnerLogin} className="hidden sm:block text-gray-600 dark:text-gray-400 font-bold hover:text-trust-blue transition">Partner Login</button>
                <button onClick={onSignUp} className="bg-trust-blue text-white px-6 py-2.5 rounded-full font-bold hover:bg-trust-blue-hover transition shadow-lg shadow-blue-500/20">Sign Up</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-4 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-900/10 dark:to-purple-900/10 -z-10" />
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-trust-blue text-sm font-bold mb-8 animate-bounce">
            <Sparkles size={16} /> Now with AI-Powered Delivery Optimization
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
            The Operating System for <span className="text-trust-blue">Modern Dry Cleaners</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-3xl mx-auto">
            Scale your laundry <span className="text-trust-blue font-bold">Pick-up and delivery</span> business with on-line orders, instant invoice, real-time driver tracking, and automated customer loyalty programs and much more...
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={onSignUp} className="px-8 py-4 bg-trust-blue text-white rounded-full font-bold text-lg hover:bg-trust-blue-hover transition-all transform hover:scale-105 shadow-xl">
              Start Your 15-Day Free Trial
            </button>
            <button className="px-8 py-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-full font-bold text-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition">
              Book a Demo
            </button>
          </div>
          <p className="mt-4 text-sm text-gray-500">No credit card required for trial • Cancel anytime</p>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-600">Everything you need to run your dry cleaning empire</p>
          </div>
          <div className="max-w-lg mx-auto bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border-4 border-trust-blue overflow-hidden transform hover:scale-[1.02] transition-transform">
            <div className="p-8 text-center bg-trust-blue text-white">
              <h3 className="text-2xl font-bold mb-2">Professional SaaS Plan</h3>
              <div className="flex items-center justify-center gap-1">
                <span className="text-4xl font-bold">£65</span>
                <span className="text-xl opacity-80">/month</span>
              </div>
            </div>
            <div className="p-8">
              <ul className="space-y-4 mb-8">
                {[
                  "Unlimited Customers & Orders",
                  "Driver Tracking App",
                  "Customer Portal & CRM",
                  "Inventory & Catalog Management",
                  "Automated Email Marketing",
                  "Sales Reports & Analytics",
                  "Multi-device POS Support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-eco-green shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <button onClick={onSignUp} className="w-full py-4 bg-trust-blue text-white rounded-xl font-bold hover:bg-trust-blue-hover transition shadow-lg">
                Get Started Now
              </button>
            </div>
          </div>
        </div>
      </section>
      <footer className="bg-gray-950 text-white py-12 border-t border-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-trust-blue" size={24} />
              <span className="font-bold text-xl uppercase tracking-tighter">CLEANPOS</span>
            </div>
            <div className="flex gap-8 text-sm text-gray-400 font-medium">
              <a href="#" className="hover:text-white transition">Product</a>
              <a href="#" className="hover:text-white transition">Pricing</a>
              <a href="#" className="hover:text-white transition">Resources</a>
              <a href="#" className="hover:text-white transition">Support</a>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={onPartnerLogin} className="text-xs text-gray-600 hover:text-gray-400 transition underline underline-offset-4">Log in to existing store</button>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-gray-500">© 2026 Posso Software Solutions Ltd. All rights reserved.</p>
            <button
              onClick={() => {
                // Secret trigger for master login if not on master subdomain
                const masterLoginTrigger = (window as any)._openMaster;
                if (masterLoginTrigger) masterLoginTrigger();
              }}
              className="text-[10px] text-gray-800 hover:text-gray-700 transition"
            >
              Master Node Access
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

const MasterAdminDashboard: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [passes, setPasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'passes'>('overview');
  const [stats, setStats] = useState({ totalRevenue: 0, totalOrders: 0, activeTenants: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  // Voucher creation state
  const [newPassCode, setNewPassCode] = useState('');
  const [newPassDuration, setNewPassDuration] = useState(12);
  const [isCreatingPass, setIsCreatingPass] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    if (activeTab === 'overview') {
      const { data: tenantData } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
      const { data: orderData } = await supabase.from('cp_orders').select('total_amount');

      if (tenantData) {
        setTenants(tenantData);
        const totalRev = orderData?.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0) || 0;
        setStats({
          totalRevenue: totalRev,
          totalOrders: orderData?.length || 0,
          activeTenants: tenantData.length
        });
      }
    } else {
      const { data: passData } = await supabase.from('cp_partner_passes').select('*').order('created_at', { ascending: false });
      if (passData) setPasses(passData);
    }
    setLoading(false);
  };

  const createPass = async () => {
    if (!newPassCode) return;
    const cleanCode = newPassCode.toUpperCase().trim();
    setIsCreatingPass(true);

    try {
      // Check if already exists
      const { data: existing } = await supabase.from('cp_partner_passes').select('id').eq('code', cleanCode).maybeSingle();
      if (existing) {
        alert('A voucher with this code already exists. Please choose a unique code.');
        setIsCreatingPass(false);
        return;
      }

      const { error } = await supabase.from('cp_partner_passes').insert([{
        code: cleanCode,
        duration_months: newPassDuration
      }]);

      if (!error) {
        setNewPassCode('');
        fetchData();
      } else {
        alert('Error creating pass: ' + error.message);
      }
    } catch (err: any) {
      alert('System error: ' + err.message);
    } finally {
      setIsCreatingPass(false);
    }
  };

  const deletePass = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this voucher?')) return;
    const { error } = await supabase.from('cp_partner_passes').delete().eq('id', id);
    if (!error) {
      alert('Voucher deleted successfully.');
      fetchData();
    } else {
      alert('Error deleting voucher: ' + error.message);
    }
  };

  const revokePass = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to revoke the redemption for "${code}"? This will allow it to be used again.`)) return;
    const { error } = await supabase
      .from('cp_partner_passes')
      .update({ is_redeemed: false, redeemed_at: null, redeemed_by_tenant_id: null, expires_at: null })
      .eq('id', id);
    if (!error) fetchData();
  };

  const handleUpdateTenant = async () => {
    if (!editingTenant) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: editingTenant.name,
          subdomain: editingTenant.subdomain,
          subscription_status: editingTenant.subscription_status
        })
        .eq('id', editingTenant.id);

      if (error) throw error;
      alert('Tenant updated successfully.');
      setEditingTenant(null);
      fetchData();
    } catch (err: any) {
      alert('Error updating tenant: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePlatformDelete = async (id: string, name: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('cp_master_delete_tenant', {
        target_tenant_id: id
      });

      if (error) {
        console.error('Delete error details:', error);
        alert('Error deleting tenant: ' + (error.message || 'Unknown error'));
      } else {
        alert('Success: "' + name + '" has been removed from the platform.');
        fetchData(); // Refresh list without reloading page
      }
    } catch (err: any) {
      console.error('System error:', err);
      alert('System Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Navigation Bar */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-trust-blue" /> POSSO Master
            </h1>
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('overview')}
                className={`text-sm font-bold px-4 py-2 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-blue-50 text-trust-blue' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                Network Overview
              </button>
              <button
                onClick={() => setActiveTab('passes')}
                className={`text-sm font-bold px-4 py-2 rounded-lg transition-colors ${activeTab === 'passes' ? 'bg-blue-50 text-trust-blue' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                Partner Passes
              </button>
            </div>
          </div>
          <button onClick={onLogout} className="text-sm font-bold text-red-500 flex items-center gap-2 hover:bg-red-50 px-4 py-2 rounded-lg transition">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-8">
        {activeTab === 'overview' ? (
          <div className="animate-fade-in">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Total Platform Sales</p>
                <p className="text-3xl font-bold text-trust-blue">£{stats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Active Tenants</p>
                <p className="text-3xl font-bold text-purple-600">{stats.activeTenants}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Free Trialing</p>
                <p className="text-3xl font-bold text-orange-500">{tenants.filter(t => t.subscription_status === 'trialing').length}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Total Orders</p>
                <p className="text-3xl font-bold text-eco-green">{stats.totalOrders}</p>
              </div>
            </div>

            {/* Tenant Table */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <h2 className="font-bold text-xl">Platform Tenants</h2>
                <div className="flex gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search tenants..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-lg text-sm outline-none w-64"
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-[10px] font-bold uppercase text-gray-400">
                      <th className="px-6 py-4">Business</th>
                      <th className="px-6 py-4">Domain</th>
                      <th className="px-6 py-4">Joined</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Pass Expiry</th>
                      <th className="px-6 py-4 text-right">Settings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {tenants
                      .filter(t =>
                        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        t.subdomain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        t.id?.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map(tenant => (
                        <tr key={tenant.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900 dark:text-white">{tenant.name}</div>
                            <div className="text-[10px] text-gray-500 font-mono">{tenant.id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <a href={`https://${tenant.subdomain}.cleanpos.app`} target="_blank" className="text-trust-blue hover:underline font-medium text-sm">
                              {tenant.subdomain}.cleanpos.app
                            </a>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {new Date(tenant.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tenant.subscription_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                              }`}>
                              {tenant.subscription_status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {tenant.pass_expires_at ? (
                              <div className="flex items-center gap-1.5 text-purple-600 text-sm font-bold">
                                <Zap size={14} /> {new Date(tenant.pass_expires_at).toLocaleDateString()}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">No Pass</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingTenant(tenant)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                              >
                                <Settings size={18} className="text-gray-400" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const name = tenant.name;
                                  const id = tenant.id;

                                  // Safety check
                                  const userInput = window.prompt(`To DELETE "${name}", type "DELETE" below:\n\nThis cannot be undone.`);

                                  if (userInput === 'DELETE') {
                                    handlePlatformDelete(id, name);
                                  }
                                }}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all font-bold text-xs disabled:opacity-50"
                              >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Creator Card */}
              <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 lg:col-span-1">
                <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
                  <Ticket className="text-purple-600" size={24} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Create Partner Pass</h2>
                <p className="text-sm text-gray-500 mb-8">Generate unique access codes for POSSO partners. These unlock 12 months (or more) of full access.</p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Unique Access Code</label>
                    <input
                      type="text"
                      placeholder="e.g. POSSO_LONDON_2026"
                      value={newPassCode}
                      onChange={e => setNewPassCode(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 font-bold text-lg outline-none focus:ring-2 ring-purple-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Duration (Months)</label>
                    <select
                      value={newPassDuration}
                      onChange={e => setNewPassDuration(Number(e.target.value))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 font-bold outline-none"
                    >
                      <option value={1}>1 Month Trial</option>
                      <option value={3}>3 Months Partner</option>
                      <option value={6}>6 Months Extended</option>
                      <option value={12}>12 Months Full Pass</option>
                      <option value={24}>24 Months Ultimate</option>
                    </select>
                  </div>
                  <button
                    onClick={createPass}
                    disabled={!newPassCode || isCreatingPass}
                    className="w-full py-4 bg-gray-950 text-white rounded-xl font-bold hover:bg-black transition shadow-lg disabled:opacity-50"
                  >
                    Generate Access Pass
                  </button>
                </div>
              </div>

              {/* Passes List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-xl">Active Voucher System</h3>
                  <button onClick={fetchData} className="p-2 hover:bg-gray-200 rounded-lg transition"><Repeat size={18} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {passes.map(pass => (
                    <div key={pass.id} className={`p-6 rounded-2xl border bg-white dark:bg-gray-900 transition-all ${pass.is_redeemed ? 'border-gray-100 opacity-60' : 'border-purple-200 shadow-sm shadow-purple-500/5'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-1">
                            {pass.duration_months} Month Access
                          </p>
                          <h4 className="text-xl font-mono font-bold">{pass.code}</h4>
                        </div>
                        {pass.is_redeemed ? (
                          <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">REDEEMED</span>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => deletePass(pass.id)} className="text-red-400 hover:text-red-500 transition"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </div>

                      {pass.is_redeemed ? (
                        <div className="pt-4 border-t border-gray-50 border-dashed flex justify-between items-end">
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>Redeemed at: {new Date(pass.redeemed_at).toLocaleDateString()}</p>
                            <p>Expires: {new Date(pass.expires_at).toLocaleDateString()}</p>
                          </div>
                          <button
                            onClick={() => revokePass(pass.id, pass.code)}
                            className="bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-500 px-2 py-1 rounded hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            Revoke
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600 text-[10px] font-bold uppercase mt-4">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          Ready for Partner
                        </div>
                      )}
                    </div>
                  ))}
                  {passes.length === 0 && (
                    <div className="col-span-2 py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
                      No active vouchers found. Generate your first one to the left.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tenant Settings Modal */}
      {editingTenant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center text-gray-900 dark:text-white">
              <h3 className="text-xl font-bold">Edit Platform Tenant</h3>
              <button onClick={() => setEditingTenant(null)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Business Name</label>
                <input
                  type="text"
                  value={editingTenant.name}
                  onChange={e => setEditingTenant({ ...editingTenant, name: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 font-bold outline-none ring-offset-2 focus:ring-2 ring-trust-blue text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Subdomain</label>
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 p-4 text-gray-900 dark:text-white">
                  <input
                    type="text"
                    value={editingTenant.subdomain}
                    onChange={e => setEditingTenant({ ...editingTenant, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="flex-1 bg-transparent border-none font-bold outline-none"
                  />
                  <span className="text-gray-400 font-medium">.cleanpos.app</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Subscription Status</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setEditingTenant({ ...editingTenant, subscription_status: 'active' })}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${editingTenant.subscription_status === 'active' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100 dark:border-gray-800 text-gray-400'}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setEditingTenant({ ...editingTenant, subscription_status: 'trialing' })}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${editingTenant.subscription_status === 'trialing' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-100 dark:border-gray-800 text-gray-400'}`}
                  >
                    Trialing
                  </button>
                </div>
              </div>
              <div className="pt-4 flex gap-4">
                <button
                  onClick={() => setEditingTenant(null)}
                  className="flex-1 py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTenant}
                  disabled={isUpdating}
                  className="flex-1 py-4 bg-trust-blue text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUpdating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SaaSSignupModal: React.FC<{ isOpen: boolean; onClose: () => void; onSignupSuccess: (tenant: any) => void }> = ({ isOpen, onClose, onSignupSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: '',
    subdomain: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    town_city: '',
    postcode: ''
  });
  const [signupResult, setSignupResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleSignup = async () => {
    setLoading(true);
    setError('');

    try {
      // 1. Check if subdomain exists
      const { data: existing } = await supabase.from('tenants').select('id').eq('subdomain', formData.subdomain.toLowerCase()).maybeSingle();
      if (existing) {
        setError('This subdomain is already taken.');
        setLoading(false);
        return;
      }

      // 2. Create Tenant
      const seoTitle = `${formData.businessName} | Professional Dry Cleaners in ${formData.town_city || 'Your Area'}`;
      const seoDesc = `Expert laundry and dry cleaning services by ${formData.businessName} in ${formData.town_city || 'the local area'}. Book online for free collection and delivery.`;
      const seoKeywords = `dry cleaners ${formData.town_city}, laundry service ${formData.town_city}, ironing service, wet cleaning, professional dry cleaning`;

      const { data: tenant, error: tError } = await supabase.from('tenants').insert([{
        name: formData.businessName,
        subdomain: formData.subdomain.toLowerCase(),
        subscription_status: 'trialing',
        trial_ends_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        address: formData.address,
        town_city: formData.town_city,
        postcode: formData.postcode,
        seo_title: seoTitle,
        seo_description: seoDesc,
        seo_keywords: seoKeywords
      }]).select().single();

      if (tError) throw tError;

      // 3. Create Staff Admin for this tenant
      const staffAdmin = {
        name: formData.businessName + ' Admin',
        login_id: formData.email,
        hashed_password: formData.password, // In production, hash this!
        role: 'super_admin',
        tenant_id: tenant.id,
        is_active: true
      };

      const { error: sError } = await supabase.from('staff').insert([staffAdmin]);

      if (sError) throw sError;

      // 4. Initialize Default Settings for new tenant
      const defaultSettings = [
        { tenant_id: tenant.id, key: 'header_color', value: '#030712' }, // gray-950
        { tenant_id: tenant.id, key: 'footer_color', value: '#030712' },
        { tenant_id: tenant.id, key: 'store_name', value: formData.businessName },
        { tenant_id: tenant.id, key: 'store_email', value: formData.email }
      ];
      await supabase.from('cp_app_settings').upsert(defaultSettings);

      // 5. Initiation of services skipped - new users start with empty list

      // 6. Send Confirmation Email
      await sendBrevoEmail({
        toEmail: formData.email,
        toName: formData.businessName,
        subject: `Welcome to CleanPOS! Your Hub for ${formData.businessName}`,
        textContent: `Hi ${formData.businessName},\n\nWelcome to the CleanPOS family! We're thrilled to help you grow your dry cleaning business.\n\nYour account has been successfully created and your 15-day free trial is now active.\n\nSTORE DETAILS:\n- Business Name: ${formData.businessName}\n- Your Domain: https://${formData.subdomain}.cleanpos.app\n- Back Office: https://${formData.subdomain}.cleanpos.app/back-office\n\nADMIN CREDENTIALS:\n- Login Email: ${formData.email}\n- Password: [The password you chose during signup]\n\nGETTING STARDED:\n1. Log in to your Back Office.\n2. Go to 'Store Settings' to customize your colors and details.\n3. Add your first service category and starts taking orders!\n\nIf you need any help, just reply to this email.\n\nKeep it clean!\nThe CleanPOS Team`
      });

      setSignupResult({ tenant, admin: staffAdmin });
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 w-full max-w-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-trust-blue/10 rounded-full -mr-16 -mt-16" />
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <X size={24} />
        </button>

        {step === 1 ? (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Rocket size={32} className="text-trust-blue" />
              </div>
              <h2 className="text-3xl font-bold">Launch Your Business</h2>
              <p className="text-gray-500">Sign up in seconds and start your 15-day free trial</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Business Name</label>
                <input
                  type="text"
                  placeholder="e.g. Elite Dry Cleaners"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition duration-200 outline-none"
                  value={formData.businessName}
                  onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subdomain</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    placeholder="your-brand"
                    className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-l-xl transition duration-200 outline-none"
                    value={formData.subdomain}
                    onChange={e => setFormData({ ...formData, subdomain: e.target.value.replace(/[^a-z0-9-]/g, '') })}
                  />
                  <span className="px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-r-xl">.cleanpos.app</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Owner Email</label>
                <input
                  type="email"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                <input
                  type="tel"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Admin Password</label>
                <input
                  type="password"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Store Address</label>
                <input
                  type="text"
                  placeholder="Street Address"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none mb-2"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Town / City"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none"
                    value={formData.town_city}
                    onChange={e => setFormData({ ...formData, town_city: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Postcode"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-trust-blue rounded-xl transition outline-none"
                    value={formData.postcode}
                    onChange={e => setFormData({ ...formData, postcode: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center font-bold animate-shake">{error}</div>}

            <button
              onClick={handleSignup}
              disabled={loading}
              className="w-full py-4 bg-trust-blue text-white rounded-xl font-bold text-lg hover:bg-trust-blue-hover transition shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : <><Zap size={20} /> Create My Store</>}
            </button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-6">
            <div className="w-24 h-24 bg-eco-green/20 rounded-full flex items-center justify-center mx-auto mb-6 scale-animation">
              <CheckCircle2 size={64} className="text-eco-green" />
            </div>
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white">You're All Set!</h2>
            <div className="space-y-4 max-w-sm mx-auto">
              <p className="text-gray-600 dark:text-gray-400">
                Your store <strong>{formData.businessName}</strong> has been created at:
              </p>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-2xl border-2 border-dashed border-trust-blue">
                <p className="font-mono text-trust-blue font-bold text-lg">{formData.subdomain}.cleanpos.app</p>
              </div>
              <p className="text-sm text-gray-500 pt-4">We've sent a welcome email with your admin login details. You can log in now to start setting up your services.</p>
            </div>
            <button
              onClick={() => onSignupSuccess(signupResult)}
              className="mt-8 px-12 py-4 bg-trust-blue text-white rounded-xl font-bold hover:bg-trust-blue-hover transition"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [tenant, setTenant] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<Page>('saas-landing');
  const [isSaaSSignupOpen, setIsSaaSSignupOpen] = useState(false);
  const [isPartnerLoginOpen, setIsPartnerLoginOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isStaffLoginOpen, setIsStaffLoginOpen] = useState(false);
  const [staffLoginType, setStaffLoginType] = useState<'admin' | 'driver' | null>(null);
  const [isMasterAuthOpen, setMasterAuthOpen] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [masterAuthError, setMasterAuthError] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [appSettings, setAppSettings] = useState<any>({});
  const [companySettings, setCompanySettings] = useState<any>(null);
  useSEO(tenant, currentPage);

  useEffect(() => {
    (window as any)._openMaster = () => setMasterAuthOpen(true);
    return () => { delete (window as any)._openMaster; };
  }, []);

  // --- Tenant Detection ---
  useEffect(() => {
    const detectTenant = async () => {
      const hostname = window.location.hostname;
      const parts = hostname.split('.');
      const params = new URLSearchParams(window.location.search);
      const forceTenant = params.get('tenant');

      let subdomain = '';

      if (forceTenant) {
        subdomain = forceTenant;
      } else if (parts.length >= 3 && parts[0] !== 'www') {
        // Handle standard subdomains (e.g., class1.cleanpos.app or class1.netlify.app)
        subdomain = parts[0];
      } else if (parts.length >= 2 && parts[parts.length - 1] === 'localhost') {
        // Handle localhost (e.g., class1.localhost)
        subdomain = parts[0];
      }

      if (subdomain) {
        if (subdomain === 'master') {
          const isMaster = localStorage.getItem('master_admin_auth') === 'true';
          if (isMaster) {
            setUserRole('master_admin');
            setCurrentPage('master-admin');
          } else {
            setCurrentPage('home');
            setMasterAuthOpen(true);
          }
          return;
        }

        const { data, error } = await supabase.from('tenants').select('*').eq('subdomain', subdomain).maybeSingle();
        if (data) {
          setTenant(data);
          // Fetch settings for this tenant
          const { data: sData } = await supabase.from('cp_app_settings').select('*').eq('tenant_id', data.id);
          if (sData) {
            const settingsMap: any = {};
            sData.forEach(s => settingsMap[s.key] = s.value);
            setAppSettings(settingsMap);
          }

          // Fetch company settings for this tenant
          const { data: cSettings } = await supabase.from('company_settings').select('*').eq('tenant_id', data.id).maybeSingle();
          if (cSettings) setCompanySettings(cSettings);

          setCurrentPage('home');
          return;
        }
      }

      // Fallback to landing page if no tenant detected
      setCurrentPage('saas-landing');
    };
    detectTenant();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      if (tenant) {
        setPage('customer-portal');
        // Clean URL without reloading
        const newUrl = window.location.pathname + window.location.search.replace(/[?&]payment=success/, '').replace(/^\?$/, '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [tenant]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDark = () => setDarkMode(!darkMode);
  const [isCustomerLoginOpen, setIsCustomerLoginOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'customer' | 'admin' | 'driver' | 'master_admin' | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);

  useEffect(() => {
    if (tenant) {
      fetchSlots();
      fetchDeliveryOptions();
      // Check if we need to open admin login (from /back-office URL path)
      if (window.location.pathname.includes('back-office') && !userRole) {
        setStaffLoginType('admin');
        setIsStaffLoginOpen(true);
        // Clean up URL to prevent re-triggering
        window.history.replaceState({}, '', `/?tenant=${tenant.subdomain}`);
      }
    }
  }, [tenant, userRole]);

  const fetchSlots = async () => {
    if (!tenant) return;
    const { data, error } = await supabase.from('cp_time_slots').select('*').eq('active', true).eq('tenant_id', tenant.id);
    if (!error && data) setAvailableSlots(data as TimeSlot[]);
  };

  const fetchDeliveryOptions = async () => {
    if (!tenant) return;
    const { data, error } = await supabase.from('cp_delivery_options').select('*').eq('tenant_id', tenant.id);
    if (!error && data) setDeliveryOptions(data as DeliveryOption[]);
  };

  const handleMasterAuth = async () => {
    try {
      const { data, error } = await supabase
        .from('cp_admin_auth')
        .select('pin_code')
        .eq('pin_code', masterPassword)
        .single();

      if (data && !error) {
        localStorage.setItem('master_admin_auth', 'true');
        setUserRole('master_admin');
        setCurrentPage('master-admin');
        setMasterAuthOpen(false);
        setMasterPassword('');
        setMasterAuthError('');
      } else {
        setMasterAuthError('Invalid Master Access Code');
      }
    } catch (err) {
      setMasterAuthError('Authentication Error');
    }
  };

  const handleStaffLogin = (type: 'admin' | 'driver') => { setStaffLoginType(type); setIsStaffLoginOpen(true); };
  const handleStaffLoginSuccess = (userData: any, role: 'admin' | 'driver') => {
    setIsStaffLoginOpen(false);
    setUserRole(role);
    setUser(userData);
    setPage(role === 'admin' ? 'back-office' : 'driver-portal' as Page);
  };
  const handleCustomerLoginSuccess = (customer: any) => { setUser(customer); setUserRole('customer'); setIsCustomerLoginOpen(false); };
  const handleLogout = () => { setUser(null); setUserRole(null); setPage(tenant ? 'home' : 'saas-landing'); };
  const setPage = (page: Page) => { window.scrollTo(0, 0); setCurrentPage(page); };
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const isPortalPage = currentPage === 'back-office' || currentPage === 'driver-portal' || currentPage === 'master-admin';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors">
      <SchemaMarkup tenant={tenant} />
      {/* Conditionally render Header based on page */}
      {tenant && !isPortalPage && (
        <Header
          tenant={tenant}
          currentPage={currentPage}
          setPage={setPage}
          cartCount={cartCount}
          onLoginClick={() => setIsCustomerLoginOpen(true)}
          isLoggedIn={!!user}
          onLogout={handleLogout}
          darkMode={darkMode}
          toggleDark={toggleDark}
          settings={appSettings}
        />
      )}

      <main>
        {currentPage === 'master-admin' && userRole === 'master_admin' ? (
          <MasterAdminDashboard onLogout={() => {
            localStorage.removeItem('master_admin_auth');
            setUserRole(null);
            window.location.reload();
          }} />
        ) : (
          <div className="flex-1">
            {currentPage === 'saas-landing' && (
              <SaaSPage
                user={user}
                onLogout={handleLogout}
                onSignUp={() => setIsSaaSSignupOpen(true)}
                onPartnerLogin={() => setIsPartnerLoginOpen(true)}
                onGoToDashboard={() => setPage('back-office')}
              />
            )}

            {tenant && (
              <>
                {currentPage === 'home' && <HomePage tenant={tenant} setPage={setPage} />}
                {currentPage === 'how-it-works' && <HowItWorksPage tenant={tenant} setPage={setPage} />}
                {currentPage === 'services' && <ServicesPage tenant={tenant} />}
                {currentPage === 'contact' && <ContactPage settings={appSettings} />}
                {currentPage === 'track-order' && <TrackOrderPage />}
                {currentPage === 'booking' && (
                  <BookingPage
                    tenant={tenant}
                    cart={cart}
                    setCart={setCart}
                    availableSlots={availableSlots}
                    currentUser={userRole === 'customer' ? user : null}
                    onLoginSuccess={handleCustomerLoginSuccess}
                    setPage={setPage}
                    companySettings={companySettings}
                  />
                )}
                {currentPage === 'customer-portal' && userRole === 'customer' && (
                  <CustomerPortalPage
                    user={user}
                    onUpdateUser={setUser}
                    tenantId={tenant.id}
                    setPage={setPage}
                    onLogout={() => { setUser(null); setUserRole(null); setPage('home'); }}
                  />
                )}
                {currentPage === 'back-office' && userRole === 'admin' && (
                  <BackOfficePage
                    tenant={tenant}
                    availableSlots={availableSlots}
                    setAvailableSlots={setAvailableSlots}
                    deliveryOptions={deliveryOptions}
                    setDeliveryOptions={setDeliveryOptions}
                    onLogout={() => { setUser(null); setUserRole(null); setPage('home'); }}
                    darkMode={darkMode}
                    toggleDark={toggleDark}
                    onTenantUpdate={setTenant}
                    companySettings={companySettings}
                  />
                )}
                {currentPage === 'driver-portal' && userRole === 'driver' && (
                  <DriverPortalPage driver={user} onLogout={() => { setUser(null); setUserRole(null); setPage('home'); }} darkMode={darkMode} toggleDark={toggleDark} />
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Master Admin Auth Modal */}
      {isMasterAuthOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-2xl w-full max-w-md text-center">
            <ShieldCheck size={64} className="text-trust-blue mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Master Platform Access</h2>
            <p className="text-gray-500 mb-6">Restricted to CleanPOS core team members only.</p>
            <input
              type="password"
              placeholder="Enter Master Password"
              className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 focus:ring-2 focus:ring-trust-blue outline-none"
              value={masterPassword}
              onChange={e => setMasterPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMasterAuth()}
            />
            {masterAuthError && <p className="text-red-500 font-bold text-sm mb-4">{masterAuthError}</p>}
            <button
              onClick={handleMasterAuth}
              className="w-full py-4 bg-trust-blue text-white rounded-xl font-bold hover:bg-trust-blue-hover transition"
            >
              Authorize Access
            </button>
            <button
              onClick={() => { setMasterAuthOpen(false); window.location.href = 'https://cleanpos.app'; }}
              className="mt-4 text-gray-500 hover:text-gray-700 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SaaS Landing Page doesn't use the standard footer */}
      {tenant && !isPortalPage && (
        <Footer
          tenant={tenant}
          setPage={setPage}
          onStaffLogin={handleStaffLogin}
          onMasterAuth={() => setMasterAuthOpen(true)}
          settings={appSettings}
        />
      )}

      <SaaSSignupModal
        isOpen={isSaaSSignupOpen}
        onClose={() => setIsSaaSSignupOpen(false)}
        onSignupSuccess={(result) => {
          setTenant(result.tenant);
          setUser(result.admin);
          setUserRole('admin');
          // In localhost, we can't easily switch subdomains, so we stay on current origin but change view
          setPage('back-office');
          setIsSaaSSignupOpen(false);
        }}
      />
      <PartnerLoginModal isOpen={isPartnerLoginOpen} onClose={() => setIsPartnerLoginOpen(false)} />
      <StaffLoginModal isOpen={isStaffLoginOpen} type={staffLoginType} onClose={() => setIsStaffLoginOpen(false)} onLogin={handleStaffLoginSuccess} tenant={tenant} />
      <CustomerLoginModal isOpen={isCustomerLoginOpen} onClose={() => setIsCustomerLoginOpen(false)} onLogin={handleCustomerLoginSuccess} tenantId={tenant?.id} storeEmail={tenant?.email} storeName={tenant?.name} />
    </div>
  );
};

export default App;