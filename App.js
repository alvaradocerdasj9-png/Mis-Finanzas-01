/**
 * Mis Finanzas v1.3
 *
 * Basado en v1.2 por ALVA
 *
 * Cambios v1.3:
 * ✅ Múltiples presupuestos (hasta 5 listas)
 * ✅ Cada lista tiene: nombre, color, moneda, período, presupuesto y historial propios
 * ✅ Selector de lista activa en el header (dropdown)
 * ✅ Gestión de listas en el drawer (crear, renombrar, eliminar)
 * ✅ Migración automática desde v1.2 (datos existentes → "Mi presupuesto")
 * ✅ Botón "Configurar presupuesto" dentro de cada lista
 * ✅ Historial separado por lista
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Modal, Share, KeyboardAvoidingView,
  Platform, StatusBar, Animated, Keyboard, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// ─────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH  = Math.min(SCREEN_WIDTH * 0.80, 320);
const LISTS_KEY     = 'finanzas_lists_v1';
const ACTIVE_KEY    = 'finanzas_active_list_v1';

// Claves legacy v1.2 para migración
const LEGACY_MOVEMENTS_KEY = 'finanzas_movimientos_v1';
const LEGACY_HISTORY_KEY   = 'finanzas_history_v1';
const LEGACY_CURRENCY_KEY  = 'finanzas_currency_v1';
const LEGACY_PERIOD_KEY    = 'finanzas_period_v1';
const LEGACY_BUDGET_KEY    = 'finanzas_budget_v1';

const CURRENCIES = [
  { symbol: '₡', code: 'CRC', label: 'Colón' },
  { symbol: '$', code: 'USD', label: 'Dólar' },
  { symbol: '€', code: 'EUR', label: 'Euro'  },
];

const PERIODS = ['Diario', 'Semanal', 'Bisemanal', 'Quincenal', 'Mensual'];

const LIST_COLORS = [
  '#4f8ef7', // azul
  '#4fcf8a', // verde
  '#e07070', // rojo
  '#e0b84a', // amarillo
  '#b07ef7', // violeta
];

const MAX_LISTS = 5;

// ─────────────────────────────────────────
// PALETA
// ─────────────────────────────────────────
const C = {
  bg:          '#0d1520',
  surface:     '#131f30',
  surface2:    '#1a2840',
  surface3:    '#223350',
  accent:      '#4f8ef7',
  accent2:     '#7eb3ff',
  accentGlow:  'rgba(79,142,247,0.15)',
  income:      '#4fcf8a',
  income2:     '#7edba8',
  expense:     '#e07070',
  expense2:    '#f0a0a0',
  text:        '#e0eaf8',
  text2:       '#8aaacf',
  text3:       '#4a6080',
  border:      'rgba(79,142,247,0.18)',
  drawerBg:    '#0b1525',
  warning:     '#e0b84a',
};

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
const getLocale = () => {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    return loc || 'es-CR';
  } catch { return 'es-CR'; }
};

const fmt = (n, symbol = '₡') => {
  const abs = Math.abs(Math.round(n));
  return `${symbol} ${abs.toLocaleString(getLocale())}`;
};

const todayStr = () => {
  const d   = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
};

const parseDateStr = (str) => {
  const parts = str.split('/');
  if (parts.length !== 3) return new Date();
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

const isInPeriod = (dateStr, period) => {
  const d     = parseDateStr(dateStr);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'Diario') {
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return itemDay.getTime() === today.getTime();
  }
  if (period === 'Semanal') {
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return itemDay >= monday && itemDay <= sunday;
  }
  if (period === 'Bisemanal') {
    const dayOfWeek = today.getDay();
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const twoWeeksAgo = new Date(thisMonday);
    twoWeeksAgo.setDate(thisMonday.getDate() - 14);
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisMonday.getDate() + 6);
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return itemDay >= twoWeeksAgo && itemDay <= thisSunday;
  }
  if (period === 'Quincenal') {
    const day          = now.getDate();
    const itemMonth    = d.getMonth();
    const itemYear     = d.getFullYear();
    const currentMonth = now.getMonth();
    const currentYear  = now.getFullYear();
    if (itemMonth !== currentMonth || itemYear !== currentYear) return false;
    if (day <= 15) return d.getDate() >= 1  && d.getDate() <= 15;
    else           return d.getDate() >= 16;
  }
  if (period === 'Mensual') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true;
};

const createList = ({ name, color, currency, period }) => ({
  id:        Date.now().toString() + Math.random().toString(36).slice(2),
  name:      name || 'Mi presupuesto',
  color:     color || LIST_COLORS[0],
  currency:  currency || CURRENCIES[0],
  period:    period  || 'Mensual',
  budget:    0,
  movements: [],
  history:   [],
});

// ─────────────────────────────────────────
// STORAGE HELPERS
// ─────────────────────────────────────────
const load = async (key, fallback) => {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
};

const persist = async (key, value) => {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* silencioso */ }
};

// ─────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────
export default function App() {
  const [mostrarSplash, setMostrarSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setMostrarSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (mostrarSplash) {
    return (
      <View style={s.splashContainer}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.splashContent}>
          <Text style={s.splashEmoji}>💰</Text>
          <Text style={s.splashTitle}>Mis Finanzas</Text>
          <Text style={s.splashSubtitle}>Tu balance personal inteligente</Text>
        </View>
        <View style={s.splashFooter}>
          <Text style={s.splashVersion}>v1.3</Text>
          <Text style={s.splashCredits}>Desarrollado por ALVA</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

// ─────────────────────────────────────────
// MOVEMENT ROW
// ─────────────────────────────────────────
function MovementRow({ item, onDelete, onUpdateField, onFocusInput, onBlurInput, currencySymbol }) {
  const [localAmount, setLocalAmount] = useState(String(item.amount));

  useEffect(() => { setLocalAmount(String(item.amount)); }, [item.amount]);

  const isIncome = item.type === 'income';

  return (
    <View style={[s.card, isIncome ? s.cardIncome : s.cardExpense]}>
      <View style={[s.typeIcon, isIncome ? s.typeIconIncome : s.typeIconExpense]}>
        <Text style={[s.typeIconText, { color: isIncome ? C.income : C.expense }]}>
          {isIncome ? '↑' : '↓'}
        </Text>
      </View>

      <View style={s.itemInfo}>
        <Text style={s.itemName} numberOfLines={1}>{item.description}</Text>
        <View style={s.itemMeta}>
          <View style={s.amountEditWrap}>
            <Text style={[s.amountPrefix, isIncome ? s.amountIncome : s.amountExpense]}>
              {isIncome ? '+' : '−'} {currencySymbol}
            </Text>
            <TextInput
              style={[s.amountInput, isIncome ? s.amountInputIncome : s.amountInputExpense]}
              value={localAmount}
              keyboardType="numeric"
              onFocus={e => {
                onFocusInput();
                e.target.setNativeProps({ selection: { start: 0, end: localAmount.length } });
              }}
              onChangeText={v => setLocalAmount(v)}
              onBlur={() => {
                const n     = parseFloat(localAmount);
                const final = (!n || n <= 0) ? item.amount : n;
                setLocalAmount(String(final));
                onUpdateField(item.id, 'amount', final);
                onBlurInput();
              }}
            />
          </View>
          <Text style={s.itemDate}>📅 {item.date}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={s.deleteBtn}
        onPress={() => onDelete(item.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.deleteBtnText}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────
// APP INNER
// ─────────────────────────────────────────
function AppInner() {
  const insets = useSafeAreaInsets();

  // ── Listas ──
  const [lists,          setLists]          = useState([]);
  const [activeListId,   setActiveListId]   = useState(null);

  // ── Formulario ──
  const [description,  setDescription]  = useState('');
  const [amount,       setAmount]       = useState('');
  const [moveType,     setMoveType]     = useState('income');
  const [dateInput,    setDateInput]    = useState(todayStr());
  const [searchQuery,  setSearchQuery]  = useState('');
  const [formVisible,  setFormVisible]  = useState(true);

  // ── Modales ──
  const [drawerVisible,        setDrawerVisible]        = useState(false);
  const [listSelectorVisible,  setListSelectorVisible]  = useState(false);
  const [budgetModalVisible,   setBudgetModalVisible]   = useState(false);
  const [budgetInput,          setBudgetInput]          = useState('');
  const [pdfModalVisible,      setPdfModalVisible]      = useState(false);
  const [finalizarVisible,     setFinalizarVisible]     = useState(false);
  const [reuseModalVisible,    setReuseModalVisible]    = useState(false);
  const [reuseSession,         setReuseSession]         = useState(null);
  const [clearHistoryModal,    setClearHistoryModal]    = useState(false);
  const [clearListModal,       setClearListModal]       = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [periodModalVisible,   setPeriodModalVisible]   = useState(false);
  const [expandedHistory,      setExpandedHistory]      = useState(null);

  // ── Modal nueva/editar lista ──
  const [newListModal,    setNewListModal]    = useState(false);
  const [editListModal,   setEditListModal]   = useState(false);
  const [editingList,     setEditingList]     = useState(null);
  const [newListName,     setNewListName]     = useState('');
  const [newListColor,    setNewListColor]    = useState(LIST_COLORS[0]);
  const [newListCurrency, setNewListCurrency] = useState(CURRENCIES[0]);
  const [newListPeriod,   setNewListPeriod]   = useState('Mensual');
  const [deleteListModal, setDeleteListModal] = useState(false);
  const [listToDelete,    setListToDelete]    = useState(null);

  // ── Toast ──
  const [toastMsg,     setToastMsg]     = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // ── Animaciones ──
  const drawerAnim    = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const finalizarAnim = useRef(new Animated.Value(0)).current;
  const descInputRef  = useRef(null);
  const editingRef    = useRef(false);

  // ─────────────────────────────────────────
  // LISTA ACTIVA (derivada)
  // ─────────────────────────────────────────
  const activeList = lists.find(l => l.id === activeListId) || lists[0] || null;

  const updateActiveList = useCallback((updater) => {
    setLists(prev => {
      const updated = prev.map(l =>
        l.id === (activeList?.id) ? { ...l, ...updater(l) } : l
      );
      persist(LISTS_KEY, updated);
      return updated;
    });
  }, [activeList]);

  const updateListById = useCallback((id, updater) => {
    setLists(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, ...updater(l) } : l);
      persist(LISTS_KEY, updated);
      return updated;
    });
  }, []);

  // ─────────────────────────────────────────
  // CARGA INICIAL + MIGRACIÓN
  // ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const savedLists = await load(LISTS_KEY, null);
      const savedActive = await load(ACTIVE_KEY, null);

      if (savedLists && savedLists.length > 0) {
        setLists(savedLists);
        setActiveListId(savedActive || savedLists[0].id);
        return;
      }

      // Migración desde v1.2
      const legacyMovements = await load(LEGACY_MOVEMENTS_KEY, []);
      const legacyHistory   = await load(LEGACY_HISTORY_KEY,   []);
      const legacyCurrency  = await load(LEGACY_CURRENCY_KEY,  CURRENCIES[0]);
      const legacyPeriod    = await load(LEGACY_PERIOD_KEY,    'Mensual');
      const legacyBudget    = await load(LEGACY_BUDGET_KEY,    0);

      const migratedList = createList({
        name:     'Mi presupuesto',
        color:    LIST_COLORS[0],
        currency: legacyCurrency,
        period:   legacyPeriod,
      });
      migratedList.movements = legacyMovements;
      migratedList.history   = legacyHistory;
      migratedList.budget    = legacyBudget;

      const initialLists = [migratedList];
      setLists(initialLists);
      setActiveListId(migratedList.id);
      await persist(LISTS_KEY, initialLists);
      await persist(ACTIVE_KEY, migratedList.id);
    })();
  }, []);

  // ── Teclado oculto → mostrar formulario ──
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      editingRef.current = false;
      setFormVisible(true);
    });
    return () => sub.remove();
  }, []);

  // ─────────────────────────────────────────
  // TOAST
  // ─────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  }, [toastAnim]);

  // ─────────────────────────────────────────
  // DRAWER
  // ─────────────────────────────────────────
  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.spring(drawerAnim, {
      toValue: 0, useNativeDriver: true, tension: 60, friction: 11,
    }).start();
  };

  const closeDrawer = (onDone) => {
    Animated.timing(drawerAnim, {
      toValue: -DRAWER_WIDTH, duration: 240, useNativeDriver: true,
    }).start(() => {
      setDrawerVisible(false);
      if (onDone) onDone();
    });
  };

  // ─────────────────────────────────────────
  // MODAL FINALIZAR
  // ─────────────────────────────────────────
  const openFinalizarModal = () => {
    setFinalizarVisible(true);
    Animated.spring(finalizarAnim, {
      toValue: 1, useNativeDriver: true, tension: 70, friction: 10,
    }).start();
  };

  const closeFinalizarModal = () => {
    Animated.spring(finalizarAnim, {
      toValue: 0, useNativeDriver: true, tension: 70, friction: 10,
    }).start(() => setFinalizarVisible(false));
  };

  // ─────────────────────────────────────────
  // CÁLCULOS (lista activa)
  // ─────────────────────────────────────────
  const movements    = activeList?.movements || [];
  const period       = activeList?.period    || 'Mensual';
  const currency     = activeList?.currency  || CURRENCIES[0];
  const budget       = activeList?.budget    || 0;
  const history      = activeList?.history   || [];

  const filteredByPeriod = movements.filter(m => isInPeriod(m.date, period));

  const totalIngreso = filteredByPeriod
    .filter(m => m.type === 'income')
    .reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

  const totalGasto = filteredByPeriod
    .filter(m => m.type === 'expense')
    .reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

  const totalBalance = totalIngreso - totalGasto;

  const budgetUsed   = budget > 0 ? Math.min(totalGasto / budget, 1) : 0;
  const budgetRemain = budget > 0 ? budget - totalGasto : 0;
  const budgetOver   = budget > 0 && totalGasto > budget;
  const budgetWarn   = budget > 0 && budgetUsed > 0.85 && !budgetOver;

  const filteredDisplay = searchQuery.trim()
    ? filteredByPeriod.filter(m =>
        m.description.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : filteredByPeriod;

  // ─────────────────────────────────────────
  // CRUD MOVIMIENTOS
  // ─────────────────────────────────────────
  const addMovement = () => {
    if (!activeList) return;
    const desc = description.trim();
    if (!desc) { showToast('Ingresá la descripción del movimiento'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { showToast('Ingresá un monto válido'); return; }

    const newMove = {
      id:          Date.now().toString(),
      description: desc,
      amount:      amt,
      type:        moveType,
      date:        dateInput || todayStr(),
    };

    updateActiveList(l => ({ movements: [newMove, ...l.movements] }));
    setDescription('');
    setAmount('');
    setDateInput(todayStr());
    Keyboard.dismiss();
    showToast(moveType === 'income' ? 'Ingreso registrado ✓' : 'Gasto registrado ✓');
  };

  const deleteMovement = (id) =>
    updateActiveList(l => ({ movements: l.movements.filter(m => m.id !== id) }));

  const updateMovementField = (id, field, val) =>
    updateActiveList(l => ({
      movements: l.movements.map(m => m.id === id ? { ...m, [field]: val } : m),
    }));

  const clearAll = () => {
    if (!movements.length) { showToast('No hay movimientos registrados'); return; }
    setClearListModal(true);
  };

  // ─────────────────────────────────────────
  // PRESUPUESTO
  // ─────────────────────────────────────────
  const saveBudget = () => {
    const val = parseFloat(budgetInput.replace(/[^\d.]/g, '')) || 0;
    updateActiveList(() => ({ budget: val }));
    setBudgetModalVisible(false);
    showToast(val > 0 ? `Presupuesto: ${fmt(val, currency.symbol)} ✓` : 'Presupuesto desactivado');
  };

  // ─────────────────────────────────────────
  // PERÍODO Y MONEDA
  // ─────────────────────────────────────────
  const selectPeriod = (per) => {
    updateActiveList(() => ({ period: per }));
    setPeriodModalVisible(false);
    showToast(`Período: ${per} ✓`);
  };

  const selectCurrency = (cur) => {
    updateActiveList(() => ({ currency: cur }));
    setCurrencyModalVisible(false);
    showToast(`Moneda: ${cur.symbol} ${cur.label} ✓`);
  };

  // ─────────────────────────────────────────
  // GESTIÓN DE LISTAS
  // ─────────────────────────────────────────
  const switchList = async (id) => {
    setActiveListId(id);
    await persist(ACTIVE_KEY, id);
    setListSelectorVisible(false);
    setSearchQuery('');
  };

  const openNewListModal = () => {
    const usedColors = lists.map(l => l.color);
    const freeColor  = LIST_COLORS.find(c => !usedColors.includes(c)) || LIST_COLORS[lists.length % LIST_COLORS.length];
    setNewListName('');
    setNewListColor(freeColor);
    setNewListCurrency(CURRENCIES[0]);
    setNewListPeriod('Mensual');
    setNewListModal(true);
  };

  const confirmNewList = async () => {
    const name = newListName.trim();
    if (!name) { showToast('Ponele un nombre al presupuesto'); return; }
    if (lists.length >= MAX_LISTS) { showToast(`Máximo ${MAX_LISTS} presupuestos`); return; }

    const newList = createList({
      name,
      color:    newListColor,
      currency: newListCurrency,
      period:   newListPeriod,
    });
    const updated = [...lists, newList];
    setLists(updated);
    await persist(LISTS_KEY, updated);
    setActiveListId(newList.id);
    await persist(ACTIVE_KEY, newList.id);
    setNewListModal(false);
    setListSelectorVisible(false);
    showToast(`"${name}" creado ✓`);
  };

  const openEditList = (list) => {
    setEditingList(list);
    setNewListName(list.name);
    setNewListColor(list.color);
    setEditListModal(true);
  };

  const confirmEditList = async () => {
    const name = newListName.trim();
    if (!name) { showToast('El nombre no puede estar vacío'); return; }
    updateListById(editingList.id, () => ({ name, color: newListColor }));
    setEditListModal(false);
    showToast('Presupuesto actualizado ✓');
  };

  const confirmDeleteList = async () => {
    if (!listToDelete) return;
    const updated = lists.filter(l => l.id !== listToDelete.id);
    setLists(updated);
    await persist(LISTS_KEY, updated);
    if (activeListId === listToDelete.id) {
      const next = updated[0]?.id || null;
      setActiveListId(next);
      await persist(ACTIVE_KEY, next);
    }
    setDeleteListModal(false);
    setListToDelete(null);
    showToast('Presupuesto eliminado 🗑');
  };

  // ─────────────────────────────────────────
  // FINALIZAR PERÍODO
  // ─────────────────────────────────────────
  const finalizarPeriodo = () => {
    if (!filteredByPeriod.length) { showToast('No hay movimientos en el período'); return; }
    openFinalizarModal();
  };

  const confirmarFinalizar = async () => {
    const session = {
      id:        Date.now().toString(),
      period,
      date:      new Date().toLocaleDateString(getLocale(), { day: '2-digit', month: 'long', year: 'numeric' }),
      time:      new Date().toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' }),
      ingreso:   totalIngreso,
      gasto:     totalGasto,
      balance:   totalBalance,
      currency:  currency.symbol,
      movements: [...filteredByPeriod],
    };

    updateActiveList(l => ({
      history:   [session, ...l.history].slice(0, 30),
      movements: l.movements.filter(m => !isInPeriod(m.date, l.period)),
    }));
    closeFinalizarModal();
    showToast('Período guardado en historial ✓');
  };

  // ─────────────────────────────────────────
  // RESTAURAR DESDE HISTORIAL
  // ─────────────────────────────────────────
  const restoreFromHistory = (session) => {
    setReuseSession(session);
    setReuseModalVisible(true);
  };

  const confirmRestoreFromHistory = () => {
    if (!reuseSession) return;
    const cloned = reuseSession.movements.map(m => ({
      ...m,
      id:   Date.now().toString() + Math.random().toString(36).slice(2),
      date: todayStr(),
    }));
    updateActiveList(l => ({ movements: [...cloned, ...l.movements] }));
    const date = reuseSession.date;
    setReuseModalVisible(false);
    setReuseSession(null);
    closeDrawer(() => showToast(`Movimientos del ${date} cargados ✓`));
  };

  // ─────────────────────────────────────────
  // PDF
  // ─────────────────────────────────────────
  const downloadPDF = async () => {
    setPdfModalVisible(false);
    const date = new Date().toLocaleDateString(getLocale(), {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const rows = filteredByPeriod.map(m => {
      const isInc = m.type === 'income';
      return `<tr>
        <td>${m.description}</td>
        <td style="text-align:center">${isInc ? 'Ingreso' : 'Gasto'}</td>
        <td style="text-align:right;color:${isInc ? '#2a9d5c' : '#c0392b'}">${isInc ? '+' : '−'} ${currency.symbol} ${Math.round(m.amount).toLocaleString(getLocale())}</td>
        <td>${m.date}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Georgia, serif; margin: 40px; color: #111; }
  h1   { font-size: 28px; margin-bottom: 4px; color: #1a2e5a; }
  .sub { color: #666; font-size: 14px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a2e5a; color: #fff; padding: 10px 12px; text-align: left; font-size: 13px; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  .total-row td { font-weight: bold; font-size: 15px; border-top: 2px solid #1a2e5a; padding-top: 14px; }
  .income { color: #2a9d5c; }
  .expense { color: #c0392b; }
  .balance-pos { color: #2a9d5c; font-size: 18px; }
  .balance-neg { color: #c0392b; font-size: 18px; }
</style>
</head><body>
<h1>💰 ${activeList?.name || 'Mis Finanzas'}</h1>
<div class="sub">${date} · Período: ${period} · Moneda: ${currency.symbol} ${currency.label}</div>
<table>
  <thead>
    <tr><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Fecha</th></tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="2">TOTAL INGRESOS</td>
      <td class="income">+ ${currency.symbol} ${Math.round(totalIngreso).toLocaleString(getLocale())}</td>
      <td></td>
    </tr>
    <tr class="total-row">
      <td colspan="2">TOTAL GASTOS</td>
      <td class="expense">− ${currency.symbol} ${Math.round(totalGasto).toLocaleString(getLocale())}</td>
      <td></td>
    </tr>
    <tr class="total-row">
      <td colspan="2">BALANCE</td>
      <td class="${totalBalance >= 0 ? 'balance-pos' : 'balance-neg'}">${totalBalance >= 0 ? '+' : '−'} ${currency.symbol} ${Math.abs(Math.round(totalBalance)).toLocaleString(getLocale())}</td>
      <td></td>
    </tr>
  </tfoot>
</table>
</body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType:    'application/pdf',
          dialogTitle: 'Compartir reporte',
          UTI:         'com.adobe.pdf',
        });
      } else {
        showToast('Compartir no disponible en este dispositivo');
      }
    } catch (err) {
      console.warn('PDF error:', err);
      showToast('Error al generar el PDF');
    }
  };

  // ─────────────────────────────────────────
  // CSV
  // ─────────────────────────────────────────
  const downloadCSV = async () => {
    setPdfModalVisible(false);
    if (!filteredByPeriod.length) { showToast('No hay movimientos para exportar'); return; }

    try {
      const sym    = currency.symbol;
      const BOM    = '\uFEFF';
      const header = 'Descripcion,Tipo,Monto,Moneda,Fecha\n';
      const rows   = filteredByPeriod.map(m =>
        `"${m.description.replace(/"/g, '""')}","${m.type === 'income' ? 'Ingreso' : 'Gasto'}",${m.amount},"${sym}","${m.date}"`
      ).join('\n');
      const totals =
        `\n"TOTAL INGRESOS","",${totalIngreso},"${sym}",""\n` +
        `"TOTAL GASTOS","",${totalGasto},"${sym}",""\n` +
        `"BALANCE","",${totalBalance},"${sym}",""`;

      const csv      = BOM + header + rows + totals;
      const fileName = `mis-finanzas-${(activeList?.name || 'lista').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.csv`;
      const fileUri  = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType:    'text/csv',
          dialogTitle: 'Guardar o compartir Excel',
          UTI:         'public.comma-separated-values-text',
        });
      } else {
        showToast('Compartir no disponible en este dispositivo');
      }
    } catch (err) {
      console.warn('CSV error:', err);
      showToast('Error al exportar el archivo');
    }
  };

  // ─────────────────────────────────────────
  // COMPARTIR
  // ─────────────────────────────────────────
  const shareList = async () => {
    if (!filteredByPeriod.length) { showToast('No hay movimientos para compartir'); return; }
    const sym  = currency.symbol;
    const text =
      `💰 *${activeList?.name || 'Mis Finanzas'} — ${period}*\n\n` +
      filteredByPeriod.map(m =>
        `${m.type === 'income' ? '↑ ' : '↓ '}${m.description} · ${m.type === 'income' ? '+' : '−'} ${fmt(m.amount, sym)} · ${m.date}`
      ).join('\n') +
      `\n\n*Ingreso: ${fmt(totalIngreso, sym)}*` +
      `\n*Gasto: ${fmt(totalGasto, sym)}*` +
      `\n*Balance: ${totalBalance >= 0 ? '+' : '−'} ${fmt(Math.abs(totalBalance), sym)}*`;
    try {
      await Share.share({ message: text });
    } catch {
      showToast('No se pudo compartir');
    }
  };

  // ─────────────────────────────────────────
  // RENDER ITEM
  // ─────────────────────────────────────────
  const renderItem = ({ item }) => (
    <MovementRow
      item={item}
      onDelete={deleteMovement}
      onUpdateField={updateMovementField}
      onFocusInput={() => { editingRef.current = true; setFormVisible(false); }}
      onBlurInput={() => { editingRef.current = false; setFormVisible(true); }}
      currencySymbol={currency.symbol}
    />
  );

  // ─────────────────────────────────────────
  // RENDER HISTORIAL ITEM
  // ─────────────────────────────────────────
  const renderHistoryItem = (session) => {
    const isExpanded = expandedHistory === session.id;
    const sym        = session.currency || currency.symbol;
    return (
      <View key={session.id} style={s.historyCard}>
        <TouchableOpacity
          style={s.historyHeader}
          onPress={() => restoreFromHistory(session)}
          onLongPress={() => setExpandedHistory(isExpanded ? null : session.id)}
          delayLongPress={400}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.historyDate}>{session.date}</Text>
            <Text style={s.historyTime}>
              {session.time} · {session.period} · {session.movements.length} movimientos
            </Text>
            <Text style={s.historyRestoreHint}>Tocá para reutilizar · mantené para ver detalle</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.historyBalance, { color: session.balance >= 0 ? C.income : C.expense }]}>
              {session.balance >= 0 ? '+' : '−'} {fmt(Math.abs(session.balance), sym)}
            </Text>
            <View style={s.historyRestoreTag}>
              <Text style={s.historyRestoreTagText}>↩ reutilizar</Text>
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.historyItems}>
            {session.movements.map((m, idx) => (
              <View key={idx} style={s.historyRow}>
                <Text style={[s.historyItemName, { color: m.type === 'income' ? C.income : C.expense }]} numberOfLines={1}>
                  {m.type === 'income' ? '↑ ' : '↓ '}{m.description}
                </Text>
                <Text style={[s.historyItemPrice, { color: m.type === 'income' ? C.income : C.expense }]}>
                  {m.type === 'income' ? '+' : '−'} {fmt(m.amount, sym)}
                </Text>
              </View>
            ))}
            <View style={s.historyTotalRow}>
              <Text style={s.historyTotalLabel}>Ingreso</Text>
              <Text style={[s.historyTotalVal, { color: C.income }]}>+ {fmt(session.ingreso, sym)}</Text>
            </View>
            <View style={s.historyTotalRow}>
              <Text style={s.historyTotalLabel}>Gasto</Text>
              <Text style={[s.historyTotalVal, { color: C.expense }]}>− {fmt(session.gasto, sym)}</Text>
            </View>
            <View style={s.historyTotalRow}>
              <Text style={s.historyTotalLabel}>Balance</Text>
              <Text style={[s.historyTotalVal, { color: session.balance >= 0 ? C.income : C.expense }]}>
                {session.balance >= 0 ? '+' : '−'} {fmt(Math.abs(session.balance), sym)}
              </Text>
            </View>
            <TouchableOpacity style={s.historyRestoreBtn} onPress={() => restoreFromHistory(session)}>
              <Text style={s.historyRestoreBtnText}>↩ Reutilizar movimientos</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ─────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────
  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.surface} />

      {/* ── TOAST ── */}
      {toastVisible && (
        <Animated.View style={[s.toast, {
          top:       insets.top + 12,
          opacity:   toastAnim,
          transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        }]}>
          <Text style={s.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ══ HEADER ══ */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <TouchableOpacity
              style={s.btnHamburger}
              onPress={openDrawer}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={s.hamburgerLine} />
              <View style={s.hamburgerLine} />
              <View style={s.hamburgerLine} />
            </TouchableOpacity>

            {/* ── SELECTOR DE LISTA ACTIVA ── */}
            <TouchableOpacity
              style={s.listSelector}
              onPress={() => setListSelectorVisible(true)}
            >
              <View style={[s.listDot, { backgroundColor: activeList?.color || C.accent }]} />
              <Text style={s.listSelectorName} numberOfLines={1}>
                {activeList?.name || 'Mi presupuesto'}
              </Text>
              <Text style={s.listSelectorChevron}>▾</Text>
            </TouchableOpacity>

            <View style={s.headerActions}>
              <TouchableOpacity
                style={s.btnCurrency}
                onPress={() => setCurrencyModalVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.btnCurrencyText}>{currency.symbol}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnIcon}
                onPress={clearAll}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.btnIconText}>🗑</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Selector de período ── */}
          <View style={s.periodSelectorRow}>
            <TouchableOpacity
              style={s.periodSelectorBtn}
              onPress={() => setPeriodModalVisible(true)}
            >
              <Text style={s.periodSelectorText}>{period}</Text>
              <Text style={s.periodSelectorChevron}>▾</Text>
            </TouchableOpacity>

            {/* ── Botón configurar presupuesto de esta lista ── */}
            <TouchableOpacity
              style={s.btnBudgetConfig}
              onPress={() => { setBudgetInput(budget > 0 ? String(budget) : ''); setBudgetModalVisible(true); }}
            >
              <Text style={s.btnBudgetConfigText}>
                {budget > 0 ? `💰 ${fmt(budget, currency.symbol)}` : '💰 Presupuesto'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Barra de presupuesto ── */}
          {budget > 0 && (
            <TouchableOpacity
              style={s.budgetBar}
              onPress={() => { setBudgetInput(String(budget)); setBudgetModalVisible(true); }}
            >
              <View style={s.budgetTrack}>
                <View style={[
                  s.budgetFill,
                  { width: `${Math.round(budgetUsed * 100)}%` },
                  budgetOver && { backgroundColor: C.expense },
                  budgetWarn && { backgroundColor: C.warning },
                ]} />
              </View>
              <Text style={[
                s.budgetText,
                budgetOver && { color: C.expense },
                budgetWarn && { color: C.warning },
              ]}>
                {budgetOver
                  ? `⚠ Excedido por ${fmt(Math.abs(budgetRemain), currency.symbol)}`
                  : `${fmt(budgetRemain, currency.symbol)} disponibles de ${fmt(budget, currency.symbol)}`}
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Tarjetas de totales ── */}
          <View style={s.totalsRow}>
            <View style={[s.totalCard, s.totalCardIncome]}>
              <Text style={s.totalLabel}>Ingreso</Text>
              <Text style={[s.totalAmount, { color: C.income }]}>{fmt(totalIngreso, currency.symbol)}</Text>
            </View>
            <View style={[s.totalCard, s.totalCardExpense]}>
              <Text style={s.totalLabel}>Gasto</Text>
              <Text style={[s.totalAmount, { color: C.expense }]}>{fmt(totalGasto, currency.symbol)}</Text>
            </View>
            <View style={[s.totalCard, s.totalCardBalance]}>
              <Text style={s.totalLabel}>Balance</Text>
              <Text style={[s.totalAmount, { color: totalBalance >= 0 ? C.income : C.expense }]}>
                {totalBalance >= 0 ? '+' : '−'}{fmt(Math.abs(totalBalance), currency.symbol)}
              </Text>
            </View>
          </View>
        </View>

        {/* ══ FORMULARIO ══ */}
        <View style={s.addSection}>
          {formVisible && (
            <>
              <Text style={s.fieldLabel}>Descripción</Text>
              <View style={s.descRow}>
                <TextInput
                  ref={descInputRef}
                  style={[s.input, { flex: 1 }]}
                  placeholder="Ej: Salario, Supermercado..."
                  placeholderTextColor={C.text3}
                  value={description}
                  onChangeText={setDescription}
                  onSubmitEditing={addMovement}
                  returnKeyType="done"
                  blurOnSubmit={false}
                />
              </View>

              <View style={s.toggleRow}>
                <TouchableOpacity
                  style={[s.toggleBtn, moveType === 'income' && s.toggleBtnIncomeActive]}
                  onPress={() => setMoveType('income')}
                >
                  <Text style={[s.toggleBtnText, moveType === 'income' && s.toggleBtnTextActiveIncome]}>
                    Ingreso
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, moveType === 'expense' && s.toggleBtnExpenseActive]}
                  onPress={() => setMoveType('expense')}
                >
                  <Text style={[s.toggleBtnText, moveType === 'expense' && s.toggleBtnTextActiveExpense]}>
                    Gasto
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={s.inputGroup}>
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>Monto ({currency.symbol})</Text>
                  <TextInput
                    style={s.input}
                    placeholder="0"
                    placeholderTextColor={C.text3}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    onSubmitEditing={addMovement}
                    returnKeyType="done"
                    onFocus={e => e.target.setNativeProps({ selection: { start: 0, end: amount.length } })}
                  />
                </View>
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>Fecha (DD/MM/AAAA)</Text>
                  <TextInput
                    style={s.input}
                    placeholder={todayStr()}
                    placeholderTextColor={C.text3}
                    value={dateInput}
                    onChangeText={setDateInput}
                    returnKeyType="done"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[s.btnAdd, { backgroundColor: moveType === 'income' ? C.income : C.expense }]}
                onPress={addMovement}
              >
                <Text style={s.btnAddText}>
                  {moveType === 'income' ? '+ Agregar ingreso' : '− Agregar gasto'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={s.btnToggleForm}
            onPress={() => {
              setFormVisible(v => !v);
              if (!formVisible) setTimeout(() => descInputRef.current?.focus(), 120);
            }}
          >
            <Text style={s.btnToggleFormText}>
              {formVisible ? '▲ Ocultar formulario ▲' : '▼ Agregar movimiento ▼'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ══ BÚSQUEDA ══ */}
        <View style={s.searchSection}>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Buscar movimientos..."
              placeholderTextColor={C.text3}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => { editingRef.current = true; setFormVisible(false); }}
              onBlur={() => { editingRef.current = false; setFormVisible(true); }}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity style={s.searchClear} onPress={() => setSearchQuery('')}>
                <Text style={s.searchClearText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ══ LISTA ══ */}
        <FlatList
          style={s.list}
          data={filteredDisplay}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[s.listContent, { paddingBottom: 80 }]}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            Keyboard.dismiss();
            editingRef.current = false;
            setFormVisible(false);
          }}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={s.emptyEmoji}>{searchQuery ? '🔍' : '💸'}</Text>
              <Text style={s.emptyText}>
                {searchQuery
                  ? `Sin resultados para "${searchQuery}"`
                  : `Sin movimientos ${period === 'Diario' ? 'hoy' : period === 'Semanal' ? 'esta semana' : period === 'Bisemanal' ? 'estas 2 semanas' : period === 'Quincenal' ? 'esta quincena' : 'este mes'}`}
              </Text>
              {!searchQuery && (
                <Text style={s.emptySmall}>Registrá ingresos y gastos arriba</Text>
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>

      {/* ══ BOTTOM BAR ══ */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={s.btnBottom} onPress={() => setPdfModalVisible(true)}>
          <Text style={s.btnBottomText}>📄 PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btnBottom, s.btnPrimary]} onPress={finalizarPeriodo}>
          <Text style={[s.btnBottomText, { color: C.bg }]}>✓ Cerrar período</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnBottom} onPress={shareList}>
          <Text style={s.btnBottomText}>↗ Compartir</Text>
        </TouchableOpacity>
      </View>

      {/* ══════════════════════════════════════
          MODAL SELECTOR DE LISTA
      ══════════════════════════════════════ */}
      <Modal
        visible={listSelectorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setListSelectorVisible(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setListSelectorVisible(false)}
        >
          <View style={[s.modalSheet, { paddingBottom: Math.max(40, insets.bottom + 20) }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Mis presupuestos</Text>
            <Text style={s.sheetSub}>Seleccioná o creá uno nuevo</Text>

            {lists.map(list => (
              <TouchableOpacity
                key={list.id}
                style={[s.listItem, list.id === activeListId && { borderColor: list.color }]}
                onPress={() => switchList(list.id)}
              >
                <View style={[s.listItemDot, { backgroundColor: list.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.listItemName}>{list.name}</Text>
                  <Text style={s.listItemSub}>
                    {list.currency.symbol} · {list.period}
                    {list.budget > 0 ? ` · Presupuesto: ${fmt(list.budget, list.currency.symbol)}` : ''}
                  </Text>
                </View>
                <View style={s.listItemActions}>
                  {list.id === activeListId && (
                    <Text style={[s.listItemCheck, { color: list.color }]}>✓</Text>
                  )}
                  <TouchableOpacity
                    style={s.listItemEditBtn}
                    onPress={() => { setListSelectorVisible(false); openEditList(list); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.listItemEditText}>✎</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}

            {lists.length < MAX_LISTS && (
              <TouchableOpacity style={s.btnNewList} onPress={openNewListModal}>
                <Text style={s.btnNewListText}>+ Nuevo presupuesto</Text>
              </TouchableOpacity>
            )}
            {lists.length >= MAX_LISTS && (
              <Text style={s.maxListsNote}>Máximo {MAX_LISTS} presupuestos alcanzado</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══════════════════════════════════════
          MODAL NUEVA LISTA
      ══════════════════════════════════════ */}
      <Modal
        visible={newListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setNewListModal(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setNewListModal(false)}
        >
          <View style={[s.modalSheet, { paddingBottom: Math.max(40, insets.bottom + 20) }]}
            onStartShouldSetResponder={() => true}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Nuevo presupuesto</Text>

            <Text style={s.fieldLabel}>Nombre</Text>
            <TextInput
              style={[s.input, { marginBottom: 16 }]}
              placeholder="Ej: Salario, Freelance, Hogar..."
              placeholderTextColor={C.text3}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
            />

            <Text style={s.fieldLabel}>Color</Text>
            <View style={s.colorRow}>
              {LIST_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[s.colorDot, { backgroundColor: color }, newListColor === color && s.colorDotSelected]}
                  onPress={() => setNewListColor(color)}
                />
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 16 }]}>Moneda</Text>
            <View style={s.toggleRow}>
              {CURRENCIES.map(cur => (
                <TouchableOpacity
                  key={cur.code}
                  style={[s.toggleBtn, newListCurrency.code === cur.code && { borderColor: C.accent, backgroundColor: C.accentGlow }]}
                  onPress={() => setNewListCurrency(cur)}
                >
                  <Text style={[s.toggleBtnText, newListCurrency.code === cur.code && { color: C.accent2 }]}>
                    {cur.symbol} {cur.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 16 }]}>Período por defecto</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PERIODS.map(per => (
                  <TouchableOpacity
                    key={per}
                    style={[s.periodChip, newListPeriod === per && { borderColor: C.accent, backgroundColor: C.accentGlow }]}
                    onPress={() => setNewListPeriod(per)}
                  >
                    <Text style={[s.periodChipText, newListPeriod === per && { color: C.accent2 }]}>{per}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={s.btnAdd} onPress={confirmNewList}>
              <Text style={[s.btnAddText, { color: '#fff' }]}>✓ Crear presupuesto</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══════════════════════════════════════
          MODAL EDITAR LISTA
      ══════════════════════════════════════ */}
      <Modal
        visible={editListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditListModal(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditListModal(false)}
        >
          <View style={[s.modalSheet, { paddingBottom: Math.max(40, insets.bottom + 20) }]}
            onStartShouldSetResponder={() => true}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Editar presupuesto</Text>

            <Text style={s.fieldLabel}>Nombre</Text>
            <TextInput
              style={[s.input, { marginBottom: 16 }]}
              placeholder="Nombre del presupuesto"
              placeholderTextColor={C.text3}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
            />

            <Text style={s.fieldLabel}>Color</Text>
            <View style={[s.colorRow, { marginBottom: 20 }]}>
              {LIST_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[s.colorDot, { backgroundColor: color }, newListColor === color && s.colorDotSelected]}
                  onPress={() => setNewListColor(color)}
                />
              ))}
            </View>

            <TouchableOpacity style={s.btnAdd} onPress={confirmEditList}>
              <Text style={[s.btnAddText, { color: '#fff' }]}>✓ Guardar cambios</Text>
            </TouchableOpacity>

            {lists.length > 1 && (
              <TouchableOpacity
                style={[s.btnAdd, { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.expense, marginTop: 10 }]}
                onPress={() => {
                  setListToDelete(editingList);
                  setEditListModal(false);
                  setDeleteListModal(true);
                }}
              >
                <Text style={[s.btnAddText, { color: C.expense }]}>🗑 Eliminar presupuesto</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══════════════════════════════════════
          MODAL ELIMINAR LISTA
      ══════════════════════════════════════ */}
      <Modal
        visible={deleteListModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteListModal(false)}
      >
        <View style={s.finalizarOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDeleteListModal(false)} activeOpacity={1} />
          <View style={s.finalizarCard}>
            <View style={s.finalizarHeader}>
              <Text style={s.finalizarTitle}>🗑 Eliminar presupuesto</Text>
            </View>
            <View style={s.finalizarContent}>
              <Text style={s.finalizarSub}>
                ¿Eliminar "{listToDelete?.name}"? Se borrarán todos sus movimientos e historial. Esta acción no se puede deshacer.
              </Text>
            </View>
            <View style={s.finalizarActions}>
              <TouchableOpacity style={s.finalizarBtnCancel} onPress={() => setDeleteListModal(false)}>
                <Text style={s.finalizarBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.finalizarBtnConfirm, { backgroundColor: C.expense, borderColor: C.expense }]}
                onPress={confirmDeleteList}
              >
                <Text style={s.finalizarBtnConfirmText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════
          DRAWER
      ══════════════════════════════════════ */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeDrawer()}
      >
        <View style={s.drawerOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => closeDrawer()} activeOpacity={1} />
          <Animated.View style={[s.drawerPanel, { transform: [{ translateX: drawerAnim }] }]}>
            <SafeAreaView edges={['top', 'left', 'bottom']} style={s.drawerSafe}>
              <View style={s.drawerHeader}>
                <Text style={s.drawerTitle}>💰 Mis Finanzas</Text>
                <TouchableOpacity onPress={() => closeDrawer()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.drawerClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

                {/* Gestión de presupuestos */}
                <View style={s.drawerSection}>
                  <Text style={s.drawerSectionTitle}>📋 MIS PRESUPUESTOS</Text>
                  {lists.map(list => (
                    <TouchableOpacity
                      key={list.id}
                      style={[s.drawerItem, { marginBottom: 8 }, list.id === activeListId && { borderColor: list.color }]}
                      onPress={() => { switchList(list.id); closeDrawer(); }}
                    >
                      <View style={[s.listDot, { backgroundColor: list.color, marginRight: 10 }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.drawerItemText}>{list.name}</Text>
                        <Text style={s.drawerItemSub}>
                          {list.currency.symbol} · {list.period}
                          {list.budget > 0 ? ` · ${fmt(list.budget, list.currency.symbol)}` : ''}
                        </Text>
                      </View>
                      {list.id === activeListId && <Text style={[s.drawerChevron, { color: list.color }]}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                  {lists.length < MAX_LISTS && (
                    <TouchableOpacity
                      style={s.drawerNewListBtn}
                      onPress={() => { closeDrawer(() => { openNewListModal(); }); }}
                    >
                      <Text style={s.drawerNewListText}>+ Nuevo presupuesto</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Historial de la lista activa */}
                <View style={s.drawerSection}>
                  <View style={s.drawerSectionHeader}>
                    <Text style={s.drawerSectionTitle}>
                      📋 HISTORIAL — {activeList?.name?.toUpperCase()}
                    </Text>
                    {history.length > 0 && (
                      <TouchableOpacity onPress={() => setClearHistoryModal(true)}>
                        <Text style={s.drawerClearHistory}>Borrar todo</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {history.length === 0 ? (
                    <View style={s.historyEmpty}>
                      <Text style={s.historyEmptyIcon}>📭</Text>
                      <Text style={s.historyEmptyText}>Aún no hay períodos guardados</Text>
                      <Text style={s.historyEmptySub}>
                        Presioná "Cerrar período" para guardar el balance actual
                      </Text>
                    </View>
                  ) : (
                    history.map(session => renderHistoryItem(session))
                  )}
                </View>
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

      {/* ══ MODAL CERRAR PERÍODO ══ */}
      <Modal
        visible={finalizarVisible}
        transparent
        animationType="none"
        onRequestClose={closeFinalizarModal}
      >
        <View style={s.finalizarOverlay}>
          <Animated.View style={[s.finalizarCard, {
            opacity: finalizarAnim,
            transform: [{ scale: finalizarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }]}>
            <View style={s.finalizarHeader}>
              <Text style={s.finalizarTitle}>¿Cerrar período?</Text>
            </View>
            <View style={s.finalizarContent}>
              <Text style={s.finalizarSub}>
                Se guardará el balance de "{activeList?.name}" en el historial y se limpiarán los movimientos del período actual.
              </Text>
              <View style={s.finalizarTotals}>
                <View style={s.finalizarTotal}>
                  <Text style={s.finalizarTotalLabel}>Ingreso</Text>
                  <Text style={[s.finalizarTotalValue, { color: C.income }]}>{fmt(totalIngreso, currency.symbol)}</Text>
                </View>
                <View style={s.finalizarDivider} />
                <View style={s.finalizarTotal}>
                  <Text style={s.finalizarTotalLabel}>Gasto</Text>
                  <Text style={[s.finalizarTotalValue, { color: C.expense }]}>{fmt(totalGasto, currency.symbol)}</Text>
                </View>
                <View style={s.finalizarDivider} />
                <View style={s.finalizarTotal}>
                  <Text style={s.finalizarTotalLabel}>Balance</Text>
                  <Text style={[s.finalizarTotalValue, { color: totalBalance >= 0 ? C.income : C.expense }]}>
                    {totalBalance >= 0 ? '+' : '−'}{fmt(Math.abs(totalBalance), currency.symbol)}
                  </Text>
                </View>
              </View>
            </View>
            <View style={s.finalizarActions}>
              <TouchableOpacity style={s.finalizarBtnCancel} onPress={closeFinalizarModal}>
                <Text style={s.finalizarBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.finalizarBtnConfirm} onPress={confirmarFinalizar}>
                <Text style={s.finalizarBtnConfirmText}>✓ Cerrar</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ══ MODAL BORRAR HISTORIAL ══ */}
      <Modal
        visible={clearHistoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setClearHistoryModal(false)}
      >
        <View style={s.finalizarOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setClearHistoryModal(false)} activeOpacity={1} />
          <View style={s.finalizarCard}>
            <View style={s.finalizarHeader}>
              <Text style={s.finalizarTitle}>🗑 Borrar historial</Text>
            </View>
            <View style={s.finalizarContent}>
              <Text style={s.finalizarSub}>
                ¿Borrar todo el historial de "{activeList?.name}"? Esta acción no se puede deshacer.
              </Text>
            </View>
            <View style={s.finalizarActions}>
              <TouchableOpacity style={s.finalizarBtnCancel} onPress={() => setClearHistoryModal(false)}>
                <Text style={s.finalizarBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.finalizarBtnConfirm, { backgroundColor: C.expense, borderColor: C.expense }]}
                onPress={() => {
                  updateActiveList(() => ({ history: [] }));
                  setClearHistoryModal(false);
                  showToast('Historial borrado 🗑');
                }}
              >
                <Text style={s.finalizarBtnConfirmText}>Borrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ MODAL LIMPIAR MOVIMIENTOS ══ */}
      <Modal
        visible={clearListModal}
        transparent
        animationType="fade"
        onRequestClose={() => setClearListModal(false)}
      >
        <View style={s.finalizarOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setClearListModal(false)} activeOpacity={1} />
          <View style={s.finalizarCard}>
            <View style={s.finalizarHeader}>
              <Text style={s.finalizarTitle}>🗑 Limpiar movimientos</Text>
            </View>
            <View style={s.finalizarContent}>
              <Text style={s.finalizarSub}>
                ¿Borrar TODOS los movimientos de "{activeList?.name}"? Esta acción no se puede deshacer.
              </Text>
              <View style={s.finalizarTotals}>
                <View style={s.finalizarTotal}>
                  <Text style={s.finalizarTotalLabel}>Registros</Text>
                  <Text style={s.finalizarTotalValue}>{movements.length}</Text>
                </View>
                <View style={s.finalizarDivider} />
                <View style={s.finalizarTotal}>
                  <Text style={s.finalizarTotalLabel}>Balance ({period})</Text>
                  <Text style={[s.finalizarTotalValue, { color: totalBalance >= 0 ? C.income : C.expense }]}>
                    {totalBalance >= 0 ? '+' : '−'}{fmt(Math.abs(totalBalance), currency.symbol)}
                  </Text>
                </View>
              </View>
            </View>
            <View style={s.finalizarActions}>
              <TouchableOpacity style={s.finalizarBtnCancel} onPress={() => setClearListModal(false)}>
                <Text style={s.finalizarBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.finalizarBtnConfirm, { backgroundColor: C.expense, borderColor: C.expense }]}
                onPress={() => {
                  updateActiveList(() => ({ movements: [] }));
                  setClearListModal(false);
                  showToast('Movimientos eliminados 🗑');
                }}
              >
                <Text style={s.finalizarBtnConfirmText}>Limpiar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ MODAL REUTILIZAR PERÍODO ══ */}
      <Modal
        visible={reuseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setReuseModalVisible(false); setReuseSession(null); }}
      >
        <View style={s.finalizarOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => { setReuseModalVisible(false); setReuseSession(null); }} activeOpacity={1} />
          <View style={s.finalizarCard}>
            <View style={s.finalizarHeader}>
              <Text style={s.finalizarTitle}>↩ Reutilizar período</Text>
            </View>
            <View style={s.finalizarContent}>
              <Text style={s.finalizarSub}>
                {reuseSession
                  ? `Se cargarán los movimientos del período ${reuseSession.period} (${reuseSession.date}) con fecha actual.`
                  : ''}
              </Text>
              {reuseSession && (
                <View style={s.finalizarTotals}>
                  <View style={s.finalizarTotal}>
                    <Text style={s.finalizarTotalLabel}>Registros</Text>
                    <Text style={s.finalizarTotalValue}>{reuseSession.movements.length}</Text>
                  </View>
                  <View style={s.finalizarDivider} />
                  <View style={s.finalizarTotal}>
                    <Text style={s.finalizarTotalLabel}>Balance</Text>
                    <Text style={[s.finalizarTotalValue, { color: reuseSession.balance >= 0 ? C.income : C.expense }]}>
                      {reuseSession.balance >= 0 ? '+' : '−'}{fmt(Math.abs(reuseSession.balance), reuseSession.currency || currency.symbol)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <View style={s.finalizarActions}>
              <TouchableOpacity style={s.finalizarBtnCancel} onPress={() => { setReuseModalVisible(false); setReuseSession(null); }}>
                <Text style={s.finalizarBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.finalizarBtnConfirm} onPress={confirmRestoreFromHistory}>
                <Text style={s.finalizarBtnConfirmText}>↩ Reutilizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ MODAL PERÍODO ══ */}
      <Modal
        visible={periodModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPeriodModalVisible(false)}
      >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setPeriodModalVisible(false)}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(40, insets.bottom + 20) }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Seleccionar período</Text>
            <Text style={s.sheetSub}>Filtra los totales y movimientos mostrados</Text>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p}
                style={[s.pdfOption, period === p && { borderColor: C.accent }]}
                onPress={() => selectPeriod(p)}
              >
                <Text style={s.pdfOptionIcon}>
                  {p === 'Diario' ? '📆' : p === 'Semanal' ? '📅' : p === 'Bisemanal' ? '📋' : p === 'Quincenal' ? '📊' : '🗓'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pdfOptionTitle}>{p}</Text>
                  <Text style={s.pdfOptionSub}>
                    {p === 'Diario'     ? 'Solo movimientos de hoy'
                    : p === 'Semanal'   ? 'Esta semana (lunes a domingo)'
                    : p === 'Bisemanal' ? 'Últimas 2 semanas'
                    : p === 'Quincenal' ? '1–15 o 16–fin de mes'
                    :                    'Este mes calendario'}
                  </Text>
                </View>
                {period === p && <Text style={{ color: C.accent, fontSize: 20 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ MODAL MONEDA ══ */}
      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setCurrencyModalVisible(false)}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(40, insets.bottom + 20) }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Moneda de "{activeList?.name}"</Text>
            <Text style={s.sheetSub}>Solo aplica a este presupuesto</Text>
            {CURRENCIES.map(cur => (
              <TouchableOpacity
                key={cur.code}
                style={[s.pdfOption, currency.code === cur.code && { borderColor: C.accent }]}
                onPress={() => selectCurrency(cur)}
              >
                <Text style={s.pdfOptionIcon}>{cur.symbol}</Text>
                <View>
                  <Text style={s.pdfOptionTitle}>{cur.label}</Text>
                  <Text style={s.pdfOptionSub}>Código: {cur.code}</Text>
                </View>
                {currency.code === cur.code && (
                  <Text style={{ marginLeft: 'auto', color: C.accent, fontSize: 20 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ MODAL PRESUPUESTO ══ */}
      <Modal
        visible={budgetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBudgetModalVisible(false)}
      >
        <TouchableOpacity
          style={[s.budgetOverlay, { paddingTop: insets.top + 70 }]}
          activeOpacity={1}
          onPress={() => setBudgetModalVisible(false)}
        >
          <View style={s.budgetCard} onStartShouldSetResponder={() => true}>
            <Text style={s.budgetCardTitle}>💰 Presupuesto — {activeList?.name}</Text>
            <Text style={s.budgetCardSub}>La app te avisará cuando estés cerca de superarlo</Text>
            <TextInput
              style={[s.input, { marginBottom: 20, fontSize: 22 }]}
              placeholder="Ej: 50000"
              placeholderTextColor={C.text3}
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
              selectTextOnFocus
              autoFocus
            />
            <View style={s.budgetBtnRow}>
              <TouchableOpacity style={s.budgetBtnSave} onPress={saveBudget}>
                <Text style={s.budgetBtnSaveText}>✓ Guardar</Text>
              </TouchableOpacity>
              {budget > 0 ? (
                <TouchableOpacity
                  style={s.budgetBtnDeactivate}
                  onPress={() => {
                    updateActiveList(() => ({ budget: 0 }));
                    setBudgetModalVisible(false);
                    showToast('Presupuesto desactivado');
                  }}
                >
                  <Text style={s.budgetBtnDeactivateText}>🚫 Desactivar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.budgetBtnCancel} onPress={() => setBudgetModalVisible(false)}>
                  <Text style={s.budgetBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══ MODAL PDF / CSV ══ */}
      <Modal
        visible={pdfModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPdfModalVisible(false)}
      >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setPdfModalVisible(false)}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(40, insets.bottom + 20) }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Exportar reporte</Text>
            <Text style={s.sheetSub}>{activeList?.name} · {period} · {filteredByPeriod.length} movimientos</Text>
            <TouchableOpacity style={s.pdfOption} onPress={downloadPDF}>
              <Text style={s.pdfOptionIcon}>📄</Text>
              <View>
                <Text style={s.pdfOptionTitle}>Descargar PDF</Text>
                <Text style={s.pdfOptionSub}>Reporte con ingresos, gastos y balance</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.pdfOption} onPress={downloadCSV}>
              <Text style={s.pdfOptionIcon}>📊</Text>
              <View>
                <Text style={s.pdfOptionTitle}>Descargar CSV</Text>
                <Text style={s.pdfOptionSub}>Compatible con Excel y Google Sheets</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.pdfOption} onPress={() => { setPdfModalVisible(false); shareList(); }}>
              <Text style={s.pdfOptionIcon}>↗</Text>
              <View>
                <Text style={s.pdfOptionTitle}>Compartir como texto</Text>
                <Text style={s.pdfOptionSub}>Para WhatsApp, Telegram, etc.</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.surface },
  flex:     { flex: 1, backgroundColor: C.bg },

  // ── SPLASH ──
  splashContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60 },
  splashContent:   { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  splashEmoji:     { fontSize: 70, marginBottom: 15, textAlign: 'center', width: '100%' },
  splashTitle:     { fontSize: 32, fontWeight: '800', color: C.accent2, letterSpacing: 1, marginBottom: 8 },
  splashSubtitle:  { fontSize: 14, color: C.text3, fontWeight: '400' },
  splashFooter:    { alignItems: 'center', gap: 4 },
  splashVersion:   { fontSize: 12, color: C.surface3, fontWeight: '600' },
  splashCredits:   { fontSize: 13, color: C.text3, fontStyle: 'italic', letterSpacing: 0.5 },

  // ── HEADER ──
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  headerTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: 8 },
  btnIcon: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  btnIconText:  { fontSize: 14, color: C.text2 },
  btnHamburger: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8,
  },
  hamburgerLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: C.text2 },

  // ── SELECTOR DE LISTA ──
  listSelector: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 10, paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
  },
  listDot:           { width: 10, height: 10, borderRadius: 5 },
  listSelectorName:  { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  listSelectorChevron: { fontSize: 12, color: C.text3 },

  // ── MONEDA ──
  btnCurrency: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCurrencyText: { fontSize: 15, fontWeight: '700', color: C.accent2 },

  // ── PERÍODO + BOTÓN PRESUPUESTO ──
  periodSelectorRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  periodSelectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: C.accent,
    backgroundColor: C.accentGlow,
  },
  periodSelectorText:    { fontSize: 13, color: C.accent2, fontWeight: '600' },
  periodSelectorChevron: { fontSize: 12, color: C.accent2 },
  btnBudgetConfig: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2, flex: 1,
  },
  btnBudgetConfigText: { fontSize: 12, color: C.text2, fontWeight: '500', flex: 1, textAlign: 'center' },

  // ── PRESUPUESTO ──
  budgetBar:   { gap: 4 },
  budgetTrack: { height: 4, backgroundColor: C.surface3, borderRadius: 2, overflow: 'hidden' },
  budgetFill:  { height: '100%', backgroundColor: C.accent, borderRadius: 2 },
  budgetText:  { fontSize: 11, color: C.text3 },

  // ── TOTALES ──
  totalsRow: { flexDirection: 'row', gap: 6 },
  totalCard: {
    flex: 1, backgroundColor: C.surface2, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: C.border,
  },
  totalCardIncome:  { borderColor: 'rgba(79,207,138,0.25)' },
  totalCardExpense: { borderColor: 'rgba(224,112,112,0.25)' },
  totalCardBalance: { borderColor: 'rgba(79,142,247,0.3)' },
  totalLabel:       { fontSize: 9, color: C.text3, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
  totalAmount:      { fontSize: 13, fontWeight: '700', color: C.accent, marginTop: 2 },

  // ── FORMULARIO ──
  addSection: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  descRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputGroup: { flexDirection: 'row', gap: 8 },
  fieldWrap:  { flex: 1, gap: 4 },
  fieldLabel: {
    fontSize: 11, color: C.text3, fontWeight: '500',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2,
  },
  input: {
    backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 10, color: C.text,
    fontSize: 15, paddingVertical: 11, paddingHorizontal: 14,
  },
  btnAdd:     { borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  btnAddText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  // ── TOGGLE TIPO ──
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnIncomeActive:      { backgroundColor: 'rgba(79,207,138,0.18)', borderColor: C.income },
  toggleBtnExpenseActive:     { backgroundColor: 'rgba(224,112,112,0.18)', borderColor: C.expense },
  toggleBtnText:              { fontSize: 14, fontWeight: '600', color: C.text3 },
  toggleBtnTextActiveIncome:  { color: C.income },
  toggleBtnTextActiveExpense: { color: C.expense },

  // ── BÚSQUEDA ──
  searchSection: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, backgroundColor: C.bg },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  searchIcon:    { position: 'absolute', left: 14, fontSize: 15, zIndex: 1 },
  searchInput: {
    flex: 1, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 10, color: C.text, fontSize: 15,
    paddingVertical: 11, paddingLeft: 42, paddingRight: 40,
  },
  searchClear: {
    position: 'absolute', right: 12,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.surface3,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  searchClearText: { color: C.text3, fontSize: 14, fontWeight: '700', lineHeight: 22 },

  // ── LISTA ──
  list:        { flex: 1 },
  listContent: { padding: 12, paddingBottom: 16 },
  emptyState:  { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyEmoji:  { fontSize: 56, marginBottom: 16 },
  emptyText:   { fontSize: 18, fontStyle: 'italic', color: C.text2, textAlign: 'center' },
  emptySmall:  { fontSize: 14, color: C.text3, marginTop: 8, textAlign: 'center' },

  // ── TARJETA MOVIMIENTO ──
  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, marginBottom: 10, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardIncome:  { borderLeftWidth: 3, borderLeftColor: C.income },
  cardExpense: { borderLeftWidth: 3, borderLeftColor: C.expense },
  typeIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIconIncome:  { backgroundColor: 'rgba(79,207,138,0.15)' },
  typeIconExpense: { backgroundColor: 'rgba(224,112,112,0.15)' },
  typeIconText:    { fontSize: 16, fontWeight: '700', color: C.text2 },
  itemInfo:        { flex: 1, minWidth: 0 },
  itemName:        { fontSize: 15, fontWeight: '500', color: C.text },
  itemMeta:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  amountIncome:    { color: C.income },
  amountExpense:   { color: C.expense },
  amountEditWrap:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  amountPrefix:    { fontSize: 14, fontWeight: '700' },
  amountInput: {
    fontSize: 15, fontWeight: '700', color: C.text,
    backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8,
    minWidth: 80,
  },
  amountInputIncome:  { borderColor: 'rgba(79,207,138,0.35)' },
  amountInputExpense: { borderColor: 'rgba(224,112,112,0.35)' },
  itemDate:     { fontSize: 12, color: C.text3 },
  deleteBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:{ fontSize: 18 },

  // ── BOTTOM BAR ──
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 100,
    backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    flexDirection: 'row', gap: 8,
  },
  btnBottom: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 8,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  btnPrimary:    { backgroundColor: C.accent, borderColor: C.accent },
  btnBottomText: { fontSize: 13, fontWeight: '600', color: C.text2 },

  // ── TOAST ──
  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: C.accent,
    paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 99, zIndex: 999,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── DRAWER ──
  drawerOverlay: { flex: 1, flexDirection: 'row' },
  drawerPanel: {
    width: DRAWER_WIDTH, backgroundColor: C.drawerBg,
    borderRightWidth: 1, borderRightColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 24,
  },
  drawerSafe:    { flex: 1 },
  drawerHeader:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  drawerTitle:         { fontSize: 20, fontWeight: '700', color: C.accent2 },
  drawerClose:         { fontSize: 20, color: C.text3 },
  drawerSection:       { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  drawerSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  drawerSectionTitle:  { fontSize: 11, color: C.text3, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  drawerClearHistory:  { fontSize: 12, color: C.expense },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: C.surface2,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  drawerItemText: { fontSize: 15, fontWeight: '600', color: C.text },
  drawerItemSub:  { fontSize: 12, color: C.text3, marginTop: 2 },
  drawerChevron:  { fontSize: 20, color: C.text3 },
  drawerNewListBtn: {
    marginTop: 8, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed',
    alignItems: 'center', backgroundColor: C.accentGlow,
  },
  drawerNewListText: { color: C.accent, fontSize: 14, fontWeight: '600' },

  // ── SELECTOR DE LISTAS (modal sheet) ──
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: C.surface2, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  listItemDot:     { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  listItemName:    { fontSize: 15, fontWeight: '600', color: C.text },
  listItemSub:     { fontSize: 12, color: C.text3, marginTop: 2 },
  listItemActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listItemCheck:   { fontSize: 18, fontWeight: '700' },
  listItemEditBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  listItemEditText:{ fontSize: 16, color: C.text3 },
  btnNewList: {
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed',
    alignItems: 'center', backgroundColor: C.accentGlow, marginTop: 4,
  },
  btnNewListText: { color: C.accent, fontSize: 15, fontWeight: '600' },
  maxListsNote:   { fontSize: 12, color: C.text3, textAlign: 'center', marginTop: 8 },

  // ── NUEVA LISTA — color picker ──
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  colorDot: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: 'transparent',
  },
  colorDotSelected: { borderColor: '#fff', transform: [{ scale: 1.15 }] },

  // ── PERIOD CHIPS ──
  periodChip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2,
  },
  periodChipText: { fontSize: 13, color: C.text3, fontWeight: '500' },

  // ── HISTORIAL ──
  historyEmpty:       { alignItems: 'center', paddingVertical: 24 },
  historyEmptyIcon:   { fontSize: 36, marginBottom: 8 },
  historyEmptyText:   { fontSize: 14, color: C.text2, textAlign: 'center' },
  historyEmptySub:    { fontSize: 12, color: C.text3, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  historyCard: {
    backgroundColor: C.surface2, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden',
  },
  historyHeader:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  historyDate:         { fontSize: 14, fontWeight: '600', color: C.text2 },
  historyTime:         { fontSize: 12, color: C.text3, marginTop: 2 },
  historyRestoreHint:  { fontSize: 11, color: C.accent, marginTop: 4, fontStyle: 'italic' },
  historyBalance:      { fontSize: 16, fontWeight: '700', color: C.accent },
  historyRestoreTag: {
    marginTop: 6, backgroundColor: C.accentGlow,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8,
  },
  historyRestoreTagText: { fontSize: 11, color: C.accent, fontWeight: '600', letterSpacing: 0.3 },
  historyItems:          { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10, paddingHorizontal: 14 },
  historyRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  historyItemName:       { flex: 1, fontSize: 13, color: C.text2 },
  historyItemPrice:      { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  historyTotalRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border },
  historyTotalLabel:     { fontSize: 12, color: C.text3, fontWeight: '600', textTransform: 'uppercase' },
  historyTotalVal:       { fontSize: 14, fontWeight: '700' },
  historyRestoreBtn: {
    marginTop: 12, backgroundColor: C.accent, borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  historyRestoreBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },

  // ── MODAL FINALIZAR ──
  finalizarOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  finalizarCard: {
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 20, paddingVertical: 24, width: '100%', maxWidth: 360,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 16,
  },
  finalizarHeader:     { marginBottom: 16, alignItems: 'center' },
  finalizarTitle:      { fontSize: 22, fontWeight: '700', color: C.accent2, letterSpacing: 0.2 },
  finalizarContent:    { marginBottom: 20, gap: 16 },
  finalizarSub:        { fontSize: 14, color: C.text3, textAlign: 'center' },
  finalizarTotals: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface2, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  finalizarTotal:      { flex: 1, alignItems: 'center' },
  finalizarDivider:    { width: 1, height: 40, backgroundColor: C.border, marginHorizontal: 8 },
  finalizarTotalLabel: { fontSize: 10, color: C.text3, fontWeight: '500', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  finalizarTotalValue: { fontSize: 14, fontWeight: '700', color: C.accent },
  finalizarActions:    { flexDirection: 'row', gap: 12 },
  finalizarBtnCancel: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2, alignItems: 'center',
  },
  finalizarBtnCancelText:  { fontSize: 14, fontWeight: '600', color: C.text2 },
  finalizarBtnConfirm: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: C.accent, alignItems: 'center',
    borderWidth: 1, borderColor: C.accent,
  },
  finalizarBtnConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── MODAL SHEET ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: C.border,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: C.surface3, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:  { fontSize: 22, fontWeight: '700', color: C.accent2, marginBottom: 4 },
  sheetSub:    { fontSize: 13, color: C.text3, marginBottom: 20 },
  pdfOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: C.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  pdfOptionIcon:  { fontSize: 24 },
  pdfOptionTitle: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 2 },
  pdfOptionSub:   { fontSize: 12, color: C.text3 },

  // ── MODAL PRESUPUESTO ──
  budgetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-start', paddingHorizontal: 24,
  },
  budgetCard: {
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border,
    padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 16,
  },
  budgetCardTitle: { fontSize: 20, fontWeight: '700', color: C.accent2, marginBottom: 4 },
  budgetCardSub:   { fontSize: 13, color: C.text3, marginBottom: 18 },
  budgetBtnRow:    { flexDirection: 'row', gap: 10 },
  budgetBtnSave: {
    flex: 1, backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  budgetBtnSaveText:       { color: C.bg, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  budgetBtnDeactivate: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(224,112,112,0.45)',
    backgroundColor: 'rgba(224,112,112,0.1)',
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  budgetBtnDeactivateText: { fontSize: 14, fontWeight: '600', color: C.expense, letterSpacing: 0.2 },
  budgetBtnCancel: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.surface2,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  budgetBtnCancelText: { fontSize: 14, fontWeight: '600', color: C.text2 },

  // ── TOGGLE FORMULARIO ──
  btnToggleForm:     { alignItems: 'center', paddingVertical: 7 },
  btnToggleFormText: { fontSize: 11, color: C.text3, fontWeight: '500', letterSpacing: 0.6 },
});
