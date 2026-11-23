import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Plus,
  List,
  Calendar,
  Search,
  AlertCircle,
  Map,
  Loader2,
  ShieldCheck,
  Trash2,
  Database,
  RefreshCw,
  Clock,
  Home,
  Building,
  Settings,
  Coffee,
  Check,
  RotateCcw,
  Play,
  Building2,
  Sparkles,
  Briefcase,
  Car,
} from 'lucide-react';

// --- [Supabase 클라우드 DB 설정] ---
const SUPABASE_URL = 'https://rvzyjcsqdebhtqauapfi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_060rzT1Fy508DxwlQ9XC3w_vwb8uu3P';

// --- [샌드박스/시크릿 모드 안전 스토리지 유틸리티] ---
const memoryStorage = {};
const safeStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return memoryStorage[key] || null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      memoryStorage[key] = value;
    }
  },
};

// --- [초기 샘플 데이터 (DB가 비어있거나 오프라인일 때 기본 제공)] ---
const INITIAL_CLIENTS = [
  {
    id: 101,
    name: '잠실역',
    type: 'MONTHLY',
    address: '서울특별시 송파구 올림픽로 265',
    knowHow: '8번 출구 인근 지하 주차장 이용 권장',
    estimated_time: 30,
    status: 'PENDING',
    lat: 37.5132,
    lng: 127.1001,
  },
  {
    id: 102,
    name: '롯데월드',
    type: 'MONTHLY',
    address: '서울특별시 송파구 올림픽로 240',
    knowHow: '방문증 수령 시 명함 지참 필수',
    estimated_time: 30,
    status: 'PENDING',
    lat: 37.5111,
    lng: 127.0981,
  },
  {
    id: 103,
    name: '롯데마트 본사',
    type: 'MONTHLY',
    address: '서울특별시 송파구 올림픽로 269',
    knowHow: '4000원 주차 지원, 전산실 3층',
    estimated_time: 90,
    status: 'PENDING',
    lat: 37.5135,
    lng: 127.1009,
  },
  {
    id: 104,
    name: '흥국화재',
    type: 'QUARTERLY',
    address: '전북특별자치도 전주시 완산구 팔달로 123',
    knowHow: '건물 뒤편 지상 주차장 이용',
    estimated_time: 60,
    status: 'PENDING',
    lat: 35.8242,
    lng: 127.1479,
  },
];

// --- [두 좌표 간 직선 거리(km) 계산 (Haversine)] ---
function getDistanceKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- [행정구역 텍스트 유사도 점수 계산] ---
function getAddressSimilarity(addrA, addrB) {
  const tokensA = (addrA || '').replace(/,/g, '').split(/\s+/);
  const tokensB = (addrB || '').replace(/,/g, '').split(/\s+/);
  let score = 0;
  tokensA.forEach((token) => {
    if (token.length > 1 && tokensB.includes(token)) {
      score += 1;
    }
  });
  return score;
}

// --- [시간대별 수도권 교통 혼잡 계수 반환] ---
function getTrafficProfile(departMinutes) {
  const isMorningRush = departMinutes >= 8 * 60 && departMinutes <= 10 * 60;
  const isEveningRush = departMinutes >= 17 * 60 && departMinutes <= 19 * 60;

  if (isMorningRush) {
    return { multiplier: 1.45, avgSpeedKmh: 23, label: '오전 출근길 반영' };
  }
  if (isEveningRush) {
    return { multiplier: 1.45, avgSpeedKmh: 22, label: '퇴근길 정체 반영' };
  }
  return { multiplier: 1.25, avgSpeedKmh: 32, label: '주간 평균 주행' };
}

// --- [OSRM 실제 도로 경로 + 수도권 교통량 보정 이동시간 계산] ---
async function calculateRealTravelInfo(fromPoint, toPoint, departMinutes, routeCache) {
  if (
    !fromPoint ||
    !toPoint ||
    !fromPoint.lat ||
    !fromPoint.lng ||
    !toPoint.lat ||
    !toPoint.lng
  ) {
    return { minutes: 30, distanceKm: null, label: '기본 추정' };
  }

  const straightKm = getDistanceKm(
    fromPoint.lat,
    fromPoint.lng,
    toPoint.lat,
    toPoint.lng
  );

  // 500m 이내 인접 건물은 주차 이동 없이 도보/단거리 5분 처리
  if (straightKm !== null && straightKm <= 0.5) {
    return {
      minutes: 5,
      distanceKm: Number(Math.max(0.1, straightKm * 1.2).toFixed(1)),
      label: '인접 단지 이동',
    };
  }

  const traffic = getTrafficProfile(departMinutes);
  const cacheKey = `${fromPoint.lat.toFixed(4)},${fromPoint.lng.toFixed(
    4
  )}->${toPoint.lat.toFixed(4)},${toPoint.lng.toFixed(4)}`;

  let roadDistanceKm = null;
  let baseDriveMins = null;

  if (routeCache && routeCache[cacheKey]) {
    roadDistanceKm = routeCache[cacheKey].roadDistanceKm;
    baseDriveMins = routeCache[cacheKey].baseDriveMins;
  } else {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const url = `https://router.project-osrm.org/route/v1/driving/${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}?overview=false`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          roadDistanceKm = data.routes[0].distance / 1000;
          baseDriveMins = data.routes[0].duration / 60;
          if (routeCache) {
            routeCache[cacheKey] = { roadDistanceKm, baseDriveMins };
          }
        }
      }
    } catch (e) {
      // OSRM 네트워크 지연/차단 시 도로 우회율 보정 모델로 자동 대체
    }
  }

  let totalMins = 30;
  let finalKm = roadDistanceKm;

  if (baseDriveMins !== null && roadDistanceKm !== null) {
    const parkingBuffer = roadDistanceKm < 2 ? 3 : 5;
    totalMins = baseDriveMins * traffic.multiplier + parkingBuffer;
  } else if (straightKm !== null) {
    finalKm = straightKm * 1.35;
    const parkingBuffer = finalKm < 2 ? 3 : 5;
    totalMins = (finalKm / traffic.avgSpeedKmh) * 60 + parkingBuffer;
  }

  const roundedMins = Math.max(5, Math.round(totalMins / 5) * 5);

  return {
    minutes: roundedMins,
    distanceKm: finalKm !== null ? Number(finalKm.toFixed(1)) : null,
    label: traffic.label,
  };
}

export default function App() {
  const [clients, setClients] = useState([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [isDbConnected, setIsDbConnected] = useState(false);

  const [activeTab, setActiveTab] = useState('list');
  const [filterType, setFilterType] = useState('ALL');

  // 스케줄러 및 동선 상태
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedSeedClient, setSelectedSeedClient] = useState(null);
  const [dailySchedule, setDailySchedule] = useState([]);
  const [plannedVisits, setPlannedVisits] = useState([]);
  const [optimizationNote, setOptimizationNote] = useState('');
  const [autoFillMorningGap, setAutoFillMorningGap] = useState(true);

  // 자택 / 회사 환경설정 (주소 + 좌표)
  const [homeAddress, setHomeAddress] = useState(
    () => safeStorage.getItem('fieldops_home') || '경기 성남시 분당구 판교역로 146'
  );
  const [homeCoords, setHomeCoords] = useState(() => {
    try {
      const saved = safeStorage.getItem('fieldops_home_coords');
      return saved ? JSON.parse(saved) : { lat: 37.3947, lng: 127.1112 };
    } catch (e) {
      return { lat: 37.3947, lng: 127.1112 };
    }
  });

  const [officeAddress, setOfficeAddress] = useState(
    () =>
      safeStorage.getItem('fieldops_office') ||
      '경기 성남시 분당구 대왕판교로644번길 49 한컴타워'
  );
  const [officeCoords, setOfficeCoords] = useState(() => {
    try {
      const saved = safeStorage.getItem('fieldops_office_coords');
      return saved ? JSON.parse(saved) : { lat: 37.402, lng: 127.1086 };
    } catch (e) {
      return { lat: 37.402, lng: 127.1086 };
    }
  });

  // 설정 탭 내 주소 검색 상태 (자택 / 회사)
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [homeSearchResults, setHomeSearchResults] = useState([]);
  const [isSearchingHome, setIsSearchingHome] = useState(false);

  const [officeSearchQuery, setOfficeSearchQuery] = useState('');
  const [officeSearchResults, setOfficeSearchResults] = useState([]);
  const [isSearchingOffice, setIsSearchingOffice] = useState(false);

  // 출/퇴근(직출/직퇴) 옵션
  const [startPoint, setStartPoint] = useState('HOME');
  const [endPoint, setEndPoint] = useState('HOME');

  // 커스텀 알림/확인 모달 상태
  const [toastMessage, setToastMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [naviGuideModal, setNaviGuideModal] = useState(null);

  // 고객 등록 폼 상태
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('MONTHLY');
  const [newAddress, setNewAddress] = useState('');
  const [newKnowHow, setNewKnowHow] = useState('');
  const [newEstimatedTime, setNewEstimatedTime] = useState(60);
  const [newCoords, setNewCoords] = useState({ lat: 0, lng: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // 고객 등록 장소 검색 상태
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);

  // 도로 경로 캐시
  const routeCacheRef = useRef({});

  const hasSupabaseConfig =
    SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 10;

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 3200);
  };

  const loadLocalClients = () => {
    const saved = safeStorage.getItem('fieldops_clients_v5');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // 파싱 오류 시 기본 데이터 반환
      }
    }
    return INITIAL_CLIENTS;
  };

  const saveLocalClients = (list) => {
    safeStorage.setItem('fieldops_clients_v5', JSON.stringify(list));
  };

  // --- [1. DB 및 로컬 고객사 목록 불러오기] ---
  const fetchClients = async () => {
    setIsLoadingDb(true);
    const localList = loadLocalClients();

    if (!hasSupabaseConfig) {
      setClients(localList);
      setIsDbConnected(false);
      setIsLoadingDb(false);
      return;
    }

    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/clients?select=*&order=id.desc`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error('DB 조회 실패');
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const localCacheMap = {};
        localList.forEach((item) => {
          localCacheMap[item.name] = item;
        });

        const formatted = data.map((row) => {
          const cached = localCacheMap[row.name] || {};
          return {
            id: row.id,
            name: row.name,
            type: row.type === 'QUARTERLY' ? 'QUARTERLY' : 'MONTHLY',
            address: row.address,
            knowHow: row.know_how || '',
            estimated_time:
              Number(row.estimated_time) || cached.estimated_time || 60,
            status: row.status
              ? row.status === 'COMPLETED'
                ? 'COMPLETED'
                : 'PENDING'
              : cached.status || 'PENDING',
            lat: Number(row.lat) || cached.lat || 0,
            lng: Number(row.lng) || cached.lng || 0,
          };
        });
        setClients(formatted);
        saveLocalClients(formatted);
      } else {
        setClients(localList);
      }
      setIsDbConnected(true);
    } catch (error) {
      setClients(localList);
      setIsDbConnected(false);
    } finally {
      setIsLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // --- [공통 OpenStreetMap 장소 검색 함수] ---
  const queryNominatimPlaces = async (keyword) => {
    const encoded = encodeURIComponent(keyword.trim());
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=kr&limit=5&accept-language=ko`
    );
    if (!response.ok) throw new Error('검색 응답 오류');
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  };

  // --- [좌표 누락 장소 자동 지오코딩] ---
  const resolveCoordinates = async (addressText, fallbackName = '') => {
    try {
      let results = await queryNominatimPlaces(addressText);
      if (results.length === 0 && fallbackName) {
        results = await queryNominatimPlaces(fallbackName);
      }
      if (results.length > 0) {
        return {
          lat: parseFloat(results[0].lat) || 0,
          lng: parseFloat(results[0].lon) || 0,
        };
      }
    } catch (e) {
      // 지오코딩 실패 시 0 반환
    }
    return { lat: 0, lng: 0 };
  };

  // --- [2-A. 고객 등록 장소 검색] ---
  const handlePlaceSearch = async (e) => {
    e.preventDefault();
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const data = await queryNominatimPlaces(searchKeyword);
      setSearchResults(data);
      if (data.length === 0) {
        showToast('검색 결과가 없습니다. 다른 키워드로 검색해 보세요.');
      }
    } catch (error) {
      showToast('장소 검색 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item) => {
    const placeName = item.name || item.display_name.split(',')[0].trim();
    setNewName(placeName);
    setNewAddress(item.display_name);
    setNewCoords({
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lon) || 0,
    });
    setSearchResults([]);
    setSearchKeyword('');
  };

  // --- [2-B. 설정 탭: 자택 / 회사 주소 검색] ---
  const handleHomeSearch = async (e) => {
    e.preventDefault();
    if (!homeSearchQuery.trim()) return;
    setIsSearchingHome(true);
    setHomeSearchResults([]);
    try {
      const data = await queryNominatimPlaces(homeSearchQuery);
      setHomeSearchResults(data);
      if (data.length === 0) {
        showToast('자택 검색 결과가 없습니다. 도로명이나 아파트명으로 검색해 보세요.');
      }
    } catch (error) {
      showToast('자택 주소 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearchingHome(false);
    }
  };

  const handleSelectHomeResult = (item) => {
    const coords = {
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lon) || 0,
    };
    setHomeAddress(item.display_name);
    setHomeCoords(coords);
    safeStorage.setItem('fieldops_home', item.display_name);
    safeStorage.setItem('fieldops_home_coords', JSON.stringify(coords));
    setHomeSearchResults([]);
    setHomeSearchQuery('');
    showToast('자택 주소와 GPS 좌표가 적용되었습니다.');
  };

  const handleOfficeSearch = async (e) => {
    e.preventDefault();
    if (!officeSearchQuery.trim()) return;
    setIsSearchingOffice(true);
    setOfficeSearchResults([]);
    try {
      const data = await queryNominatimPlaces(officeSearchQuery);
      setOfficeSearchResults(data);
      if (data.length === 0) {
        showToast('회사 검색 결과가 없습니다. 건물명이나 도로명으로 검색해 보세요.');
      }
    } catch (error) {
      showToast('회사 주소 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearchingOffice(false);
    }
  };

  const handleSelectOfficeResult = (item) => {
    const coords = {
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lon) || 0,
    };
    setOfficeAddress(item.display_name);
    setOfficeCoords(coords);
    safeStorage.setItem('fieldops_office', item.display_name);
    safeStorage.setItem('fieldops_office_coords', JSON.stringify(coords));
    setOfficeSearchResults([]);
    setOfficeSearchQuery('');
    showToast('회사 주소와 GPS 좌표가 적용되었습니다.');
  };

  // --- [3. 새 고객사 저장 (DB 스키마 호환 + 좌표 자동 보완)] ---
  const handleAddClient = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newAddress.trim()) {
      showToast('고객사명과 주소를 입력해 주세요.');
      return;
    }

    setIsSaving(true);
    let finalCoords = newCoords;
    if (!finalCoords.lat || !finalCoords.lng) {
      finalCoords = await resolveCoordinates(newAddress.trim(), newName.trim());
    }

    const newClientObj = {
      id: Date.now(),
      name: newName.trim(),
      type: newType,
      address: newAddress.trim(),
      knowHow: newKnowHow.trim(),
      estimated_time: newEstimatedTime,
      status: 'PENDING',
      lat: finalCoords.lat,
      lng: finalCoords.lng,
    };

    const optimisticList = [newClientObj, ...clients];
    setClients(optimisticList);
    saveLocalClients(optimisticList);

    if (isDbConnected) {
      try {
        // 1차 시도: 전체 확장 컬럼 포함 저장
        let res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            name: newClientObj.name,
            type: newClientObj.type,
            address: newClientObj.address,
            know_how: newClientObj.knowHow,
            estimated_time: newClientObj.estimated_time,
            status: 'PENDING',
            lat: newClientObj.lat,
            lng: newClientObj.lng,
          }),
        });

        // 2차 폴백: 확장 컬럼 미추가 시 기본 컬럼으로 저장
        if (!res.ok) {
          res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              name: newClientObj.name,
              type: newClientObj.type,
              address: newClientObj.address,
              know_how: newClientObj.knowHow,
            }),
          });
        }

        if (res.ok) {
          const inserted = await res.json();
          if (Array.isArray(inserted) && inserted[0]?.id) {
            const syncedList = optimisticList.map((item) =>
              item.id === newClientObj.id ? { ...item, id: inserted[0].id } : item
            );
            setClients(syncedList);
            saveLocalClients(syncedList);
          }
        }
      } catch (err) {
        // 네트워크 실패 시에도 로컬에 이미 저장됨
      }
    }

    setNewName('');
    setNewAddress('');
    setNewKnowHow('');
    setNewEstimatedTime(60);
    setNewCoords({ lat: 0, lng: 0 });
    setIsSaving(false);
    setActiveTab('list');
    showToast('고객사가 등록되었습니다.');
  };

  // --- [4. 점검 상태 변경 (완료 / 복구)] ---
  const handleUpdateStatus = async (id, newStatus) => {
    const updated = clients.map((c) =>
      c.id === id ? { ...c, status: newStatus } : c
    );
    setClients(updated);
    saveLocalClients(updated);

    if (newStatus === 'COMPLETED') {
      showToast('점검 완료 처리되었습니다.');
    } else {
      showToast('진행 대기 상태로 복구되었습니다.');
    }

    if (isDbConnected) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch (err) {
        // DB 컬럼 미생성 시 무시
      }
    }
  };

  // --- [5. 고객사 삭제] ---
  const handleDeleteClient = (id) => {
    setConfirmDialog({
      msg: '이 고객사를 목록에서 삭제하시겠습니까?',
      action: async () => {
        const updated = clients.filter((c) => c.id !== id);
        setClients(updated);
        saveLocalClients(updated);
        setConfirmDialog(null);
        showToast('삭제되었습니다.');

        if (isDbConnected) {
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${id}`, {
              method: 'DELETE',
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              },
            });
          } catch (err) {
            // DB 삭제 실패 시 무시
          }
        }
      },
    });
  };

  // --- [설정 저장 및 좌표 보정] ---
  const saveSettings = async () => {
    safeStorage.setItem('fieldops_home', homeAddress);
    safeStorage.setItem('fieldops_office', officeAddress);

    if (homeAddress.trim()) {
      const resolvedHome = await resolveCoordinates(homeAddress.trim());
      if (resolvedHome.lat && resolvedHome.lng) {
        setHomeCoords(resolvedHome);
        safeStorage.setItem('fieldops_home_coords', JSON.stringify(resolvedHome));
      }
    }

    if (officeAddress.trim()) {
      const resolvedOffice = await resolveCoordinates(officeAddress.trim());
      if (resolvedOffice.lat && resolvedOffice.lng) {
        setOfficeCoords(resolvedOffice);
        safeStorage.setItem('fieldops_office_coords', JSON.stringify(resolvedOffice));
      }
    }

    showToast('자택 및 회사 기준지 설정이 저장되었습니다.');
  };

  // --- [분 단위 시간을 HH:MM 문자열로 변환] ---
  const formatTime = (totalMinutes) => {
    const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const hrs = Math.floor(normalized / 60);
    const mins = normalized % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  // --- [점심시간(11:30~13:00) 기준 장기 점검 오전/오후 분할 배정 헬퍼] ---
  const pushVisitWithLunchSplit = ({
    schedule,
    client,
    order,
    arrivalTime,
    workDuration,
    lunchInserted,
    lunchStart,
    lunchEnd,
    extraBadge = '',
  }) => {
    if (lunchInserted) {
      const startTime = Math.max(arrivalTime, lunchEnd);
      const finishTime = startTime + workDuration;
      schedule.push({
        type: 'VISIT',
        order,
        time: `${formatTime(startTime)} ~ ${formatTime(finishTime)}`,
        title: client.name,
        detail: extraBadge
          ? `${extraBadge} · ${workDuration}분`
          : `예상 점검 ${workDuration}분`,
        knowHow: client.knowHow,
        address: client.address,
        client,
      });
      return { finishTime, lunchInserted: true, wasSplit: false };
    }

    if (arrivalTime + workDuration <= lunchStart) {
      const finishTime = arrivalTime + workDuration;
      schedule.push({
        type: 'VISIT',
        order,
        time: `${formatTime(arrivalTime)} ~ ${formatTime(finishTime)}`,
        title: client.name,
        detail: extraBadge
          ? `${extraBadge} · ${workDuration}분`
          : `예상 점검 ${workDuration}분`,
        knowHow: client.knowHow,
        address: client.address,
        client,
      });
      return { finishTime, lunchInserted: false, wasSplit: false };
    }

    const morningChunk = lunchStart - arrivalTime;
    const afternoonChunk = workDuration - morningChunk;

    if (morningChunk >= 30 && afternoonChunk >= 15) {
      const afternoonFinish = lunchEnd + afternoonChunk;

      schedule.push({
        type: 'VISIT',
        order,
        time: `${formatTime(arrivalTime)} ~ ${formatTime(lunchStart)}`,
        title: `${client.name} (오전 1차)`,
        detail: `오전 ${morningChunk}분 진행 (총 ${workDuration}분 중)`,
        knowHow: client.knowHow,
        address: client.address,
        client,
        isSplitPart: true,
      });

      schedule.push({
        type: 'LUNCH',
        time: '11:30 ~ 13:00',
        title: '점심 식사 및 휴식 (고정)',
        address: `${client.name} 인근 점심 휴식 후 오후 재개`,
      });

      schedule.push({
        type: 'VISIT',
        order,
        time: `${formatTime(lunchEnd)} ~ ${formatTime(afternoonFinish)}`,
        title: `${client.name} (오후 2차 이어서 진행)`,
        detail: `잔여 ${afternoonChunk}분 완료`,
        knowHow: null,
        address: client.address,
        client,
        isSplitPart: true,
      });

      return {
        finishTime: afternoonFinish,
        lunchInserted: true,
        wasSplit: true,
        morningChunk,
        afternoonChunk,
      };
    }

    schedule.push({
      type: 'LUNCH',
      time: '11:30 ~ 13:00',
      title: '점심 식사 및 휴식 (고정)',
      address: '점심시간 제외 자동 스케줄링',
    });

    const startTime = Math.max(arrivalTime, lunchEnd);
    const finishTime = startTime + workDuration;
    schedule.push({
      type: 'VISIT',
      order,
      time: `${formatTime(startTime)} ~ ${formatTime(finishTime)}`,
      title: client.name,
      detail: `예상 점검 ${workDuration}분`,
      knowHow: client.knowHow,
      address: client.address,
      client,
    });

    return { finishTime, lunchInserted: true, wasSplit: false };
  };

  // --- [6. AI 권역 동선 및 하루 일과 스케줄러] ---
  const generateDailySchedule = async (
    rawSeedClient,
    overrideStart = startPoint,
    overrideEnd = endPoint,
    useSmartMorning = autoFillMorningGap
  ) => {
    if (!rawSeedClient) return;

    setSelectedSeedClient(rawSeedClient);
    setIsOptimizing(true);
    setActiveTab('route');

    try {
      let seedClient = { ...rawSeedClient };
      if (!seedClient.lat || !seedClient.lng) {
        const resolved = await resolveCoordinates(
          seedClient.address,
          seedClient.name
        );
        if (resolved.lat && resolved.lng) {
          seedClient = { ...seedClient, ...resolved };
          setClients((prev) => {
            const next = prev.map((c) =>
              c.id === seedClient.id ? seedClient : c
            );
            saveLocalClients(next);
            return next;
          });
        }
      }

      let activeHomeCoords = homeCoords;
      if (
        (!activeHomeCoords.lat || !activeHomeCoords.lng) &&
        homeAddress.trim()
      ) {
        const resolvedHome = await resolveCoordinates(homeAddress.trim());
        if (resolvedHome.lat && resolvedHome.lng) {
          activeHomeCoords = resolvedHome;
          setHomeCoords(resolvedHome);
          safeStorage.setItem(
            'fieldops_home_coords',
            JSON.stringify(resolvedHome)
          );
        }
      }

      let activeOfficeCoords = officeCoords;
      if (
        (!activeOfficeCoords.lat || !activeOfficeCoords.lng) &&
        officeAddress.trim()
      ) {
        const resolvedOffice = await resolveCoordinates(officeAddress.trim());
        if (resolvedOffice.lat && resolvedOffice.lng) {
          activeOfficeCoords = resolvedOffice;
          setOfficeCoords(resolvedOffice);
          safeStorage.setItem(
            'fieldops_office_coords',
            JSON.stringify(resolvedOffice)
          );
        }
      }

      const pendingOthers = clients.filter(
        (c) => c.status !== 'COMPLETED' && c.id !== seedClient.id
      );

      const enrichedCandidates = await Promise.all(
        pendingOthers.map(async (cand) => {
          let updatedCand = { ...cand };
          if (!updatedCand.lat || !updatedCand.lng) {
            const resolved = await resolveCoordinates(
              updatedCand.address,
              updatedCand.name
            );
            if (resolved.lat && resolved.lng) {
              updatedCand = { ...updatedCand, ...resolved };
            }
          }

          const distKm = getDistanceKm(
            seedClient.lat,
            seedClient.lng,
            updatedCand.lat,
            updatedCand.lng
          );
          const simScore = getAddressSimilarity(
            seedClient.address,
            updatedCand.address
          );

          return {
            ...updatedCand,
            distKm,
            simScore,
          };
        })
      );

      const sameZoneCandidates = enrichedCandidates
        .filter((cand) => {
          if (cand.distKm !== null) {
            return cand.distKm <= 25;
          }
          return cand.simScore > 0;
        })
        .sort((a, b) => {
          if (a.distKm !== null && b.distKm !== null) {
            return a.distKm - b.distKm;
          }
          return b.simScore - a.simScore;
        });

      const OFFICE_EARLIEST_DEPART = 9 * 60; // 09:00 회사 가장 빠른 출발 기준
      const DIRECT_ARRIVE_MIN = 9 * 60 + 30; // 09:30 직출 최소 도착 목표
      const DIRECT_ARRIVE_MAX = 10 * 60; // 10:00 직출 최대 도착 목표
      const LUNCH_START = 11 * 60 + 30; // 11:30 점심 시작
      const LUNCH_END = 13 * 60; // 13:00 점심 종료
      const DAY_END = 17 * 60 + 30; // 17:30 일과 종료

      const originPoint =
        overrideStart === 'HOME'
          ? { ...activeHomeCoords, address: homeAddress }
          : { ...activeOfficeCoords, address: officeAddress };

      const firstTravelInfo = await calculateRealTravelInfo(
        originPoint,
        seedClient,
        OFFICE_EARLIEST_DEPART,
        routeCacheRef.current
      );
      const firstTravel = firstTravelInfo.minutes;
      const firstWork = Number(seedClient.estimated_time) || 60;

      const schedule = [];
      const usedIds = new Set([seedClient.id]);
      const finalVisitList = [];
      let currentTime = OFFICE_EARLIEST_DEPART;
      let lunchInserted = false;
      let splitSummaryNotes = [];
      let note = '';

      // [단계 1-A: 자택 출발(직출) -> 첫 고객사 09:30~10:00 도착 기준 역산]
      if (overrideStart === 'HOME') {
        const earliestDirectFinish = DIRECT_ARRIVE_MIN + firstWork;
        let morningFitClient = null;
        let morningFitTravel = null;

        if (useSmartMorning && earliestDirectFinish < LUNCH_START) {
          for (const cand of sameZoneCandidates) {
            const candWork = Number(cand.estimated_time) || 60;
            const travelToCand = await calculateRealTravelInfo(
              seedClient,
              cand,
              earliestDirectFinish,
              routeCacheRef.current
            );
            const candArrival = earliestDirectFinish + travelToCand.minutes;
            const morningAvail = LUNCH_START - candArrival;

            const fitsFullyBeforeLunch = candArrival + candWork <= LUNCH_START;
            const fitsWithLunchSplit =
              morningAvail >= 30 &&
              candWork - morningAvail >= 15 &&
              LUNCH_END + (candWork - morningAvail) <= DAY_END;

            if (fitsFullyBeforeLunch || fitsWithLunchSplit) {
              morningFitClient = cand;
              morningFitTravel = travelToCand;
              break;
            }
          }
        }

        if (morningFitClient && morningFitTravel) {
          const targetArrival = DIRECT_ARRIVE_MIN;
          const homeDepartTime = targetArrival - firstTravel;
          const firstFinish = targetArrival + firstWork;

          usedIds.add(morningFitClient.id);
          finalVisitList.push(seedClient, morningFitClient);

          schedule.push({
            type: 'START',
            time: formatTime(homeDepartTime),
            title: '자택 출발 (직출)',
            detail: `${formatTime(targetArrival)} 현장 도착 기준`,
            address: homeAddress,
          });

          schedule.push({
            type: 'TRAVEL',
            time: `${formatTime(homeDepartTime)} ~ ${formatTime(targetArrival)}`,
            duration: firstTravel,
            distanceKm: firstTravelInfo.distanceKm,
            label: firstTravelInfo.label,
          });

          schedule.push({
            type: 'VISIT',
            order: 1,
            time: `${formatTime(targetArrival)} ~ ${formatTime(firstFinish)}`,
            title: seedClient.name,
            detail: `예상 점검 ${firstWork}분`,
            knowHow: seedClient.knowHow,
            address: seedClient.address,
            client: seedClient,
          });

          const secondStart = firstFinish + morningFitTravel.minutes;
          const secondWork = Number(morningFitClient.estimated_time) || 60;

          schedule.push({
            type: 'TRAVEL',
            time: `${formatTime(firstFinish)} ~ ${formatTime(secondStart)}`,
            duration: morningFitTravel.minutes,
            distanceKm: morningFitTravel.distanceKm,
            label: morningFitTravel.label,
          });

          const splitRes = pushVisitWithLunchSplit({
            schedule,
            client: morningFitClient,
            order: 2,
            arrivalTime: secondStart,
            workDuration: secondWork,
            lunchInserted,
            lunchStart: LUNCH_START,
            lunchEnd: LUNCH_END,
            extraBadge: '오전 공백 채움',
          });

          currentTime = splitRes.finishTime;
          lunchInserted = splitRes.lunchInserted;

          if (splitRes.wasSplit) {
            splitSummaryNotes.push(
              `[${morningFitClient.name}] 오전(${splitRes.morningChunk}분) + 오후(${splitRes.afternoonChunk}분) 분할`
            );
            note = `09:30 도착 후 오전 잔여 시간에 [${morningFitClient.name}] 1차(${splitRes.morningChunk}분)를 먼저 진행하고, 점심 후 오후에 잔여 ${splitRes.afternoonChunk}분을 이어서 완료합니다.`;
          } else {
            note = `고객사 09:30 도착에 맞춰 자택에서 ${formatTime(
              homeDepartTime
            )}에 출발하고, 오전 11:30 전 [${
              morningFitClient.name
            }] 일정까지 연속 배정했습니다.`;
          }
        } else {
          const targetArrival =
            useSmartMorning && firstWork < LUNCH_START - DIRECT_ARRIVE_MIN
              ? Math.min(
                  DIRECT_ARRIVE_MAX,
                  Math.max(DIRECT_ARRIVE_MIN, LUNCH_START - firstWork)
                )
              : DIRECT_ARRIVE_MIN;
          const homeDepartTime = targetArrival - firstTravel;

          finalVisitList.push(seedClient);

          schedule.push({
            type: 'START',
            time: formatTime(homeDepartTime),
            title: '자택 출발 (직출)',
            detail: `${formatTime(targetArrival)} 현장 도착 기준`,
            address: homeAddress,
          });

          schedule.push({
            type: 'TRAVEL',
            time: `${formatTime(homeDepartTime)} ~ ${formatTime(targetArrival)}`,
            duration: firstTravel,
            distanceKm: firstTravelInfo.distanceKm,
            label: firstTravelInfo.label,
          });

          const splitRes = pushVisitWithLunchSplit({
            schedule,
            client: seedClient,
            order: 1,
            arrivalTime: targetArrival,
            workDuration: firstWork,
            lunchInserted,
            lunchStart: LUNCH_START,
            lunchEnd: LUNCH_END,
          });

          currentTime = splitRes.finishTime;
          lunchInserted = splitRes.lunchInserted;

          if (splitRes.wasSplit) {
            note = `${formatTime(targetArrival)} 도착 후 오전 11:30까지 [${
              seedClient.name
            }] 1차(${splitRes.morningChunk}분)를 진행하고, 점심시간(11:30~13:00) 이후 오후에 잔여 ${
              splitRes.afternoonChunk
            }분을 이어서 마무리합니다.`;
          } else {
            note = `고객사 ${formatTime(
              targetArrival
            )} 도착(09:30~10:00 기준)에 맞춰 자택에서 ${formatTime(
              homeDepartTime
            )}에 출발(이동 ${firstTravel}분)하는 직출 일정을 구성했습니다.`;
          }
        }
      } else {
        // [단계 1-B: 회사 출발(출근) -> 가장 빠른 출발 09:00 이후 기준]
        const earliestArrival = OFFICE_EARLIEST_DEPART + firstTravel;
        const earliestFinish = earliestArrival + firstWork;

        if (useSmartMorning && earliestFinish < LUNCH_START) {
          let morningFitClient = null;
          let morningFitTravel = null;

          for (const cand of sameZoneCandidates) {
            const candWork = Number(cand.estimated_time) || 60;
            const travelToCand = await calculateRealTravelInfo(
              seedClient,
              cand,
              earliestFinish,
              routeCacheRef.current
            );
            const candArrival = earliestFinish + travelToCand.minutes;
            const morningAvail = LUNCH_START - candArrival;

            const fitsFullyBeforeLunch = candArrival + candWork <= LUNCH_START;
            const fitsWithLunchSplit =
              morningAvail >= 30 &&
              candWork - morningAvail >= 15 &&
              LUNCH_END + (candWork - morningAvail) <= DAY_END;

            if (fitsFullyBeforeLunch || fitsWithLunchSplit) {
              morningFitClient = cand;
              morningFitTravel = travelToCand;
              break;
            }
          }

          if (morningFitClient && morningFitTravel) {
            usedIds.add(morningFitClient.id);
            finalVisitList.push(seedClient, morningFitClient);

            schedule.push({
              type: 'START',
              time: formatTime(OFFICE_EARLIEST_DEPART),
              title: '회사 출발 (출근)',
              detail: '09:00 첫 출발 기준',
              address: officeAddress,
            });

            schedule.push({
              type: 'TRAVEL',
              time: `${formatTime(OFFICE_EARLIEST_DEPART)} ~ ${formatTime(
                earliestArrival
              )}`,
              duration: firstTravel,
              distanceKm: firstTravelInfo.distanceKm,
              label: firstTravelInfo.label,
            });

            schedule.push({
              type: 'VISIT',
              order: 1,
              time: `${formatTime(earliestArrival)} ~ ${formatTime(
                earliestFinish
              )}`,
              title: seedClient.name,
              detail: `예상 점검 ${firstWork}분`,
              knowHow: seedClient.knowHow,
              address: seedClient.address,
              client: seedClient,
            });

            const secondStart = earliestFinish + morningFitTravel.minutes;
            const secondWork = Number(morningFitClient.estimated_time) || 60;

            schedule.push({
              type: 'TRAVEL',
              time: `${formatTime(earliestFinish)} ~ ${formatTime(
                secondStart
              )}`,
              duration: morningFitTravel.minutes,
              distanceKm: morningFitTravel.distanceKm,
              label: morningFitTravel.label,
            });

            const splitRes = pushVisitWithLunchSplit({
              schedule,
              client: morningFitClient,
              order: 2,
              arrivalTime: secondStart,
              workDuration: secondWork,
              lunchInserted,
              lunchStart: LUNCH_START,
              lunchEnd: LUNCH_END,
              extraBadge: '오전 공백 채움',
            });

            currentTime = splitRes.finishTime;
            lunchInserted = splitRes.lunchInserted;

            if (splitRes.wasSplit) {
              note = `09:00 회사 출발 후 [${seedClient.name}] 점검을 마치고, 오전 남은 시간에 [${morningFitClient.name}] 1차(${splitRes.morningChunk}분)를 먼저 진행한 뒤 점심 후 잔여 ${splitRes.afternoonChunk}분을 완료합니다.`;
            } else {
              note = `09:00 회사 출발 기준으로 오전 11:30 전 [${seedClient.name}] 및 [${morningFitClient.name}] 2곳을 연속 점검하도록 배정했습니다.`;
            }
          } else if (LUNCH_START - earliestFinish >= 20) {
            const idealDepart = Math.max(
              OFFICE_EARLIEST_DEPART,
              LUNCH_START - firstTravel - firstWork
            );
            const actualArrival = idealDepart + firstTravel;
            const actualFinish = actualArrival + firstWork;

            finalVisitList.push(seedClient);

            schedule.push({
              type: 'OFFICE_WORK',
              time: `${formatTime(OFFICE_EARLIEST_DEPART)} ~ ${formatTime(
                idealDepart
              )}`,
              title: '회사 출근 및 오전 내근 업무',
              detail: `오전 공백 ${idealDepart - OFFICE_EARLIEST_DEPART}분 활용`,
              address: officeAddress,
            });

            schedule.push({
              type: 'START',
              time: formatTime(idealDepart),
              title: '회사 출발 → 현장 이동',
              address: officeAddress,
            });

            schedule.push({
              type: 'TRAVEL',
              time: `${formatTime(idealDepart)} ~ ${formatTime(actualArrival)}`,
              duration: firstTravel,
              distanceKm: firstTravelInfo.distanceKm,
              label: firstTravelInfo.label,
            });

            schedule.push({
              type: 'VISIT',
              order: 1,
              time: `${formatTime(actualArrival)} ~ ${formatTime(actualFinish)}`,
              title: seedClient.name,
              detail: `예상 점검 ${firstWork}분`,
              knowHow: seedClient.knowHow,
              address: seedClient.address,
              client: seedClient,
            });

            currentTime = actualFinish;
            note = `회사 출발 가능 시각(09:00 이후)과 이동시간(${firstTravel}분)을 역산하여 ${formatTime(
              idealDepart
            )}에 출발해 11:30 점심시간에 딱 맞춰 점검을 마칩니다.`;
          } else {
            finalVisitList.push(seedClient);
            schedule.push({
              type: 'START',
              time: formatTime(OFFICE_EARLIEST_DEPART),
              title: '회사 출발 (출근)',
              detail: '09:00 출발 기준',
              address: officeAddress,
            });
            schedule.push({
              type: 'TRAVEL',
              time: `${formatTime(OFFICE_EARLIEST_DEPART)} ~ ${formatTime(
                earliestArrival
              )}`,
              duration: firstTravel,
              distanceKm: firstTravelInfo.distanceKm,
              label: firstTravelInfo.label,
            });
            schedule.push({
              type: 'VISIT',
              order: 1,
              time: `${formatTime(earliestArrival)} ~ ${formatTime(
                earliestFinish
              )}`,
              title: seedClient.name,
              detail: `예상 점검 ${firstWork}분`,
              knowHow: seedClient.knowHow,
              address: seedClient.address,
              client: seedClient,
            });
            currentTime = earliestFinish;
          }
        } else {
          finalVisitList.push(seedClient);
          schedule.push({
            type: 'START',
            time: formatTime(OFFICE_EARLIEST_DEPART),
            title: '회사 출발 (출근)',
            detail: '09:00 출발 기준',
            address: officeAddress,
          });
          schedule.push({
            type: 'TRAVEL',
            time: `${formatTime(OFFICE_EARLIEST_DEPART)} ~ ${formatTime(
              earliestArrival
            )}`,
            duration: firstTravel,
            distanceKm: firstTravelInfo.distanceKm,
            label: firstTravelInfo.label,
          });

          const splitRes = pushVisitWithLunchSplit({
            schedule,
            client: seedClient,
            order: 1,
            arrivalTime: earliestArrival,
            workDuration: firstWork,
            lunchInserted,
            lunchStart: LUNCH_START,
            lunchEnd: LUNCH_END,
          });

          currentTime = splitRes.finishTime;
          lunchInserted = splitRes.lunchInserted;

          if (splitRes.wasSplit) {
            note = `09:00 회사 출발 후 [${seedClient.name}] 현장에서 오전(${splitRes.morningChunk}분) 1차 진행 후 점심 식사, 13:00부터 오후 잔여(${splitRes.afternoonChunk}분) 점검을 이어서 완료합니다.`;
          }
        }
      }

      // [단계 2: 점심시간(11:30~13:00) 삽입 및 오후 추가 고객사 실이동시간 반영 배정]
      const remainingAfternoonPool = sameZoneCandidates.filter(
        (c) => !usedIds.has(c.id)
      );

      for (let i = 0; i < remainingAfternoonPool.length; i++) {
        if (finalVisitList.length >= 3) break;
        const prevClient = finalVisitList[finalVisitList.length - 1];
        const nextClient = remainingAfternoonPool[i];
        const nextWork = Number(nextClient.estimated_time) || 60;

        const interTravelInfo = await calculateRealTravelInfo(
          prevClient,
          nextClient,
          currentTime,
          routeCacheRef.current
        );
        const interTravel = interTravelInfo.minutes;

        let departForNext = currentTime;
        let nextStart = currentTime + interTravel;

        if (!lunchInserted) {
          const morningAvail = LUNCH_START - nextStart;
          const canSplitAcrossLunch =
            nextStart < LUNCH_START &&
            morningAvail >= 30 &&
            nextWork - morningAvail >= 15;

          if (!canSplitAcrossLunch && nextStart + nextWork > LUNCH_START) {
            schedule.push({
              type: 'LUNCH',
              time: '11:30 ~ 13:00',
              title: '점심 식사 및 휴식 (고정)',
              address: '점심시간 제외 자동 스케줄링',
            });
            lunchInserted = true;
            departForNext = LUNCH_END;
            nextStart = LUNCH_END + interTravel;
          }
        }

        let projectedFinish = nextStart + nextWork;
        if (!lunchInserted && nextStart + nextWork > LUNCH_START) {
          const morningAvail = LUNCH_START - nextStart;
          projectedFinish = LUNCH_END + (nextWork - morningAvail);
        }

        if (projectedFinish > DAY_END) {
          break;
        }

        finalVisitList.push(nextClient);
        usedIds.add(nextClient.id);

        schedule.push({
          type: 'TRAVEL',
          time: `${formatTime(departForNext)} ~ ${formatTime(nextStart)}`,
          duration: interTravel,
          distanceKm: interTravelInfo.distanceKm,
          label: interTravelInfo.label,
        });

        const splitRes = pushVisitWithLunchSplit({
          schedule,
          client: nextClient,
          order: finalVisitList.length,
          arrivalTime: nextStart,
          workDuration: nextWork,
          lunchInserted,
          lunchStart: LUNCH_START,
          lunchEnd: LUNCH_END,
        });

        currentTime = splitRes.finishTime;
        lunchInserted = splitRes.lunchInserted;

        if (splitRes.wasSplit) {
          splitSummaryNotes.push(
            `[${nextClient.name}] 오전(${splitRes.morningChunk}분) + 오후(${splitRes.afternoonChunk}분) 분할 진행`
          );
        }
      }

      if (splitSummaryNotes.length > 0 && !note.includes('분할')) {
        note = `${note ? note + ' ' : ''}오전 잔여 시간을 활용하기 위해 ${splitSummaryNotes.join(
          ', '
        )} 일정으로 자동 조율했습니다.`;
      }

      // [단계 3: 최종 복귀(직퇴/퇴근) 실이동시간 반영]
      const lastClient = finalVisitList[finalVisitList.length - 1];
      const returnPoint =
        overrideEnd === 'HOME'
          ? { ...activeHomeCoords, address: homeAddress }
          : { ...activeOfficeCoords, address: officeAddress };

      if (!lunchInserted && currentTime <= LUNCH_START) {
        schedule.push({
          type: 'LUNCH',
          time: '11:30 ~ 13:00',
          title: '점심 식사 및 휴식 (고정)',
          address: '점심시간 제외 자동 스케줄링',
        });
        currentTime = LUNCH_END;
      }

      const returnTravelInfo = await calculateRealTravelInfo(
        lastClient,
        returnPoint,
        currentTime,
        routeCacheRef.current
      );
      const returnTravel = returnTravelInfo.minutes;
      const arrivalEnd = currentTime + returnTravel;

      schedule.push({
        type: 'TRAVEL',
        time: `${formatTime(currentTime)} ~ ${formatTime(arrivalEnd)}`,
        duration: returnTravel,
        distanceKm: returnTravelInfo.distanceKm,
        label: returnTravelInfo.label,
      });

      schedule.push({
        type: 'END',
        time: formatTime(arrivalEnd),
        title:
          overrideEnd === 'HOME' ? '자택 도착 (직퇴)' : '회사 복귀 (퇴근)',
        address: overrideEnd === 'HOME' ? homeAddress : officeAddress,
        isOvertime: arrivalEnd > DAY_END,
      });

      setPlannedVisits(finalVisitList);
      setDailySchedule(schedule);
      setOptimizationNote(note);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- [7. TMAP / 네이버 지도 다중 경유지 길안내 실행] ---
  const launchMultiNavi = (app) => {
    const visits = [];
    const seenIds = new Set();
    dailySchedule.forEach((item) => {
      if (item.type === 'VISIT' && item.client && !seenIds.has(item.client.id)) {
        seenIds.add(item.client.id);
        visits.push(item.client);
      }
    });

    if (visits.length === 0) {
      showToast('안내할 방문 일정이 없습니다.');
      return;
    }

    const dest = visits[visits.length - 1];
    const waypoints = visits.slice(0, visits.length - 1);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    let deepLink = '';
    if (app === 'tmap') {
      deepLink = `tmap://route?goalname=${encodeURIComponent(dest.name)}${
        dest.lng ? `&goalx=${dest.lng}&goaly=${dest.lat}` : ''
      }`;
      waypoints.forEach((wp, idx) => {
        deepLink += `&pass${idx + 1}name=${encodeURIComponent(wp.name)}${
          wp.lng ? `&pass${idx + 1}x=${wp.lng}&pass${idx + 1}y=${wp.lat}` : ''
        }`;
      });
    } else {
      deepLink = `nmap://route/car?dname=${encodeURIComponent(dest.name)}${
        dest.lng ? `&dlng=${dest.lng}&dlat=${dest.lat}` : ''
      }&appname=com.hancomwith.fieldops`;
      waypoints.forEach((wp, idx) => {
        deepLink += `&v${idx + 1}name=${encodeURIComponent(wp.name)}${
          wp.lng ? `&v${idx + 1}lng=${wp.lng}&v${idx + 1}lat=${wp.lat}` : ''
        }`;
      });
    }

    if (isMobile) {
      window.location.href = deepLink;
    } else {
      setNaviGuideModal({
        appName: app === 'tmap' ? 'TMAP' : '네이버 지도',
        visits,
        webUrl:
          app === 'naver'
            ? `https://map.naver.com/p/search/${encodeURIComponent(dest.name)}`
            : null,
      });
    }
  };

  const pendingClients = clients.filter((c) => {
    if (c.status === 'COMPLETED') return false;
    if (filterType === 'ALL') return true;
    return c.type === filterType;
  });

  const completedClients = clients.filter((c) => c.status === 'COMPLETED');

  const totalTravelMins = dailySchedule
    .filter((item) => item.type === 'TRAVEL')
    .reduce((acc, item) => acc + (item.duration || 0), 0);

  const totalTravelKm = dailySchedule
    .filter((item) => item.type === 'TRAVEL' && item.distanceKm !== null)
    .reduce((acc, item) => acc + item.distanceKm, 0);

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center font-sans text-slate-800">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl flex flex-col relative pb-20">
        {/* 상단 헤더 */}
        <header className="bg-slate-900 text-white px-5 py-4 shadow-md sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
              <h1 className="font-bold text-lg tracking-tight">
                FieldOps Scheduler
              </h1>
            </div>
            <button
              onClick={fetchClients}
              title="데이터 새로고침"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-bold border transition-colors ${
                isDbConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>{isDbConnected ? 'DB 연결됨' : '로컬 저장'}</span>
              <RefreshCw
                className={`w-3 h-3 ${isLoadingDb ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </header>

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 p-4 overflow-y-auto bg-slate-50">
          {/* 탭 1: 고객 관리 리스트 */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              <div className="flex bg-slate-200/80 p-1 rounded-xl">
                {[
                  {
                    key: 'ALL',
                    label: `전체 (${
                      clients.filter((c) => c.status !== 'COMPLETED').length
                    })`,
                  },
                  {
                    key: 'MONTHLY',
                    label: `월 점검 (${
                      clients.filter(
                        (c) => c.status !== 'COMPLETED' && c.type === 'MONTHLY'
                      ).length
                    })`,
                  },
                  {
                    key: 'QUARTERLY',
                    label: `분기 점검 (${
                      clients.filter(
                        (c) =>
                          c.status !== 'COMPLETED' && c.type === 'QUARTERLY'
                      ).length
                    })`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilterType(tab.key)}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      filterType === tab.key
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-100 px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs text-blue-800">
                <span className="font-medium">
                  카드를 <strong>왼쪽으로 밀면</strong> 점검 완료 처리됩니다.
                </span>
                <span className="text-[11px] font-bold text-blue-600">
                  ← 스와이프
                </span>
              </div>

              {isLoadingDb ? (
                <div className="py-16 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium">고객사 목록 불러오는 중...</p>
                </div>
              ) : pendingClients.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
                  <p className="text-sm font-bold text-slate-600">
                    진행 대기 중인 현장이 없습니다.
                  </p>
                  <p className="text-xs text-slate-400">
                    [고객 등록] 탭에서 새 고객사를 추가하거나 완료된 현장을 복구하세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingClients.map((client) => (
                    <SwipeableClientCard
                      key={client.id}
                      client={client}
                      onComplete={() =>
                        handleUpdateStatus(client.id, 'COMPLETED')
                      }
                      onDelete={() => handleDeleteClient(client.id)}
                      onGenerateSchedule={() => generateDailySchedule(client)}
                    />
                  ))}
                </div>
              )}

              {/* 완료된 현장 목록 */}
              {completedClients.length > 0 && (
                <div className="pt-4 mt-4 border-t border-slate-200 space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-500 px-1">
                    점검 완료된 현장 ({completedClients.length})
                  </h3>
                  {completedClients.map((client) => (
                    <div
                      key={client.id}
                      className="bg-slate-100 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between opacity-75"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-500 line-through truncate">
                            {client.name}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                            완료됨
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {client.address}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUpdateStatus(client.id, 'PENDING')}
                        className="shrink-0 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>복구</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 탭 2: 고객 등록 (실시간 검색 + 예상 소요 시간) */}
          {activeTab === 'add' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>고객사 / 건물명 실시간 주소 검색</span>
                </label>
                <form onSubmit={handlePlaceSearch} className="flex gap-2">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="예: 롯데월드, 판교역, 한국환경공단"
                    className="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  >
                    {isSearching ? '검색중' : '검색'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="mt-3 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {searchResults.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSelectSearchResult(item)}
                        className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-start gap-2"
                      >
                        <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {item.name || item.display_name.split(',')[0]}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {item.display_name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleAddClient}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
              >
                <div>
                  <label className="text-xs font-bold text-slate-700">
                    고객사명 *
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="상단 검색 시 자동 입력"
                    className="w-full mt-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">
                    점검 주기
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {[
                      { key: 'MONTHLY', label: '월 점검' },
                      { key: 'QUARTERLY', label: '분기 점검' },
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => setNewType(item.key)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                          newType === item.key
                            ? 'bg-blue-50 text-blue-700 border-blue-600'
                            : 'bg-white text-slate-500 border-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">
                    주소 *
                  </label>
                  <input
                    type="text"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="상단 검색 시 자동 입력"
                    className="w-full mt-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">
                    예상 점검 소요 시간
                  </label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {[30, 60, 90, 120, 180, 240].map((time) => (
                      <button
                        type="button"
                        key={time}
                        onClick={() => setNewEstimatedTime(time)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                          newEstimatedTime === time
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {time}분{time >= 180 ? ` (${time / 60}시간)` : ''}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    ※ 120분 이상 장기 점검 시 오전 잔여 시간(11:30 전)에 1차 진행 후 점심(11:30~13:00) 뒤 오후에 잔여 시간을 이어서 자동 배정합니다.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">
                    현장 출입/주차 노하우 (선택)
                  </label>
                  <textarea
                    rows={3}
                    value={newKnowHow}
                    onChange={(e) => setNewKnowHow(e.target.value)}
                    placeholder="예: 후문 공영주차장 이용, 방문증 수령 시 신분증 필수..."
                    className="w-full mt-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {isSaving ? '저장 중...' : '현장 데이터 저장하기'}
                </button>
              </form>
            </div>
          )}

          {/* 탭 3: AI 하루 일과 스케줄러 */}
          {activeTab === 'route' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>출발 / 복귀 기준 설정</span>
                  </span>
                  {selectedSeedClient && (
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                      기준: {selectedSeedClient.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      오전 출발지
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setStartPoint('HOME');
                          if (selectedSeedClient) {
                            generateDailySchedule(
                              selectedSeedClient,
                              'HOME',
                              endPoint,
                              autoFillMorningGap
                            );
                          }
                        }}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          startPoint === 'HOME'
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        자택(직출)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStartPoint('OFFICE');
                          if (selectedSeedClient) {
                            generateDailySchedule(
                              selectedSeedClient,
                              'OFFICE',
                              endPoint,
                              autoFillMorningGap
                            );
                          }
                        }}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          startPoint === 'OFFICE'
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        회사 출발
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      오후 복귀지
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setEndPoint('HOME');
                          if (selectedSeedClient) {
                            generateDailySchedule(
                              selectedSeedClient,
                              startPoint,
                              'HOME',
                              autoFillMorningGap
                            );
                          }
                        }}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          endPoint === 'HOME'
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        자택(직퇴)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEndPoint('OFFICE');
                          if (selectedSeedClient) {
                            generateDailySchedule(
                              selectedSeedClient,
                              startPoint,
                              'OFFICE',
                              autoFillMorningGap
                            );
                          }
                        }}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          endPoint === 'OFFICE'
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-500'
                        }`}
                      >
                        회사 복귀
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-center justify-between pt-1 border-t border-slate-100 cursor-pointer">
                  <span className="text-xs font-medium text-slate-600">
                    오전 공백 자동 채움 (11:30 전 인접 일정/분할 배정)
                  </span>
                  <input
                    type="checkbox"
                    checked={autoFillMorningGap}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAutoFillMorningGap(checked);
                      if (selectedSeedClient) {
                        generateDailySchedule(
                          selectedSeedClient,
                          startPoint,
                          endPoint,
                          checked
                        );
                      }
                    }}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </label>
              </div>

              {isOptimizing ? (
                <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">
                    실도로 거리 및 교통량 반영 일과표 생성 중...
                  </p>
                  <p className="text-xs text-slate-400">
                    점심시간(11:30~13:00) 및 출발/복귀 조건을 반영하고 있습니다.
                  </p>
                </div>
              ) : dailySchedule.length > 0 ? (
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-5">
                  <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-base text-slate-900">
                        추천 하루 일과 타임라인
                      </h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        방문 {plannedVisits.length}곳 · 총 이동{' '}
                        {totalTravelMins}분
                        {totalTravelKm > 0
                          ? ` (${totalTravelKm.toFixed(1)}km)`
                          : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100 shrink-0">
                      실도로 거리 반영
                    </span>
                  </div>

                  {optimizationNote && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                        {optimizationNote}
                      </p>
                    </div>
                  )}

                  <div className="relative pl-7 space-y-3 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {dailySchedule.map((ev, idx) => {
                      if (ev.type === 'TRAVEL') {
                        return (
                          <div key={idx} className="relative py-0.5">
                            <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-600">
                              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                <Car className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>
                                  이동 {ev.duration}분
                                  {ev.distanceKm !== null
                                    ? ` · ${ev.distanceKm}km`
                                    : ''}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {ev.label} ({ev.time})
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={idx} className="relative">
                          <div
                            className={`absolute -left-7 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm ${
                              ev.type === 'START' || ev.type === 'END'
                                ? 'bg-slate-800'
                                : ev.type === 'OFFICE_WORK'
                                ? 'bg-indigo-600'
                                : ev.type === 'LUNCH'
                                ? 'bg-amber-500'
                                : 'bg-blue-600'
                            }`}
                          >
                            {ev.type === 'START' || ev.type === 'END' ? (
                              <Home className="w-3 h-3" />
                            ) : ev.type === 'OFFICE_WORK' ? (
                              <Briefcase className="w-3 h-3" />
                            ) : ev.type === 'LUNCH' ? (
                              <Coffee className="w-3 h-3" />
                            ) : (
                              <span className="text-[10px] font-bold">
                                {ev.order}
                              </span>
                            )}
                          </div>

                          <div
                            className={`rounded-2xl p-3.5 ${
                              ev.type === 'LUNCH'
                                ? 'bg-amber-50 border border-amber-200/80'
                                : ev.type === 'OFFICE_WORK'
                                ? 'bg-indigo-50/60 border border-indigo-200/80'
                                : ev.type === 'VISIT'
                                ? 'bg-blue-50/40 border border-blue-100'
                                : 'bg-slate-50 border border-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                  ev.type === 'LUNCH'
                                    ? 'bg-amber-200/70 text-amber-900'
                                    : ev.type === 'OFFICE_WORK'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : ev.type === 'VISIT'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {ev.time}
                              </span>
                              {ev.detail && (
                                <span
                                  className={`text-[11px] font-bold ${
                                    ev.type === 'OFFICE_WORK'
                                      ? 'text-indigo-600'
                                      : 'text-blue-600'
                                  }`}
                                >
                                  {ev.detail}
                                </span>
                              )}
                              {ev.isOvertime && (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                  17:30 이후 도착
                                </span>
                              )}
                            </div>

                            <h4
                              className={`font-bold mt-1.5 text-sm ${
                                ev.type === 'VISIT'
                                  ? 'text-slate-900'
                                  : 'text-slate-700'
                              }`}
                            >
                              {ev.title}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                              {ev.address}
                            </p>
                            {ev.knowHow && (
                              <p className="text-[11px] text-amber-800 bg-amber-100/60 px-2.5 py-1 rounded-lg mt-2 font-medium">
                                💡 {ev.knowHow}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => launchMultiNavi('tmap')}
                      className="w-full bg-[#00498c] hover:bg-[#003a70] text-white font-bold py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 text-sm transition-colors"
                    >
                      <Navigation className="w-4 h-4 text-blue-200" />
                      <span>TMAP 다중 경유지 한 번에 전송</span>
                    </button>
                    <button
                      onClick={() => launchMultiNavi('naver')}
                      className="w-full bg-[#03C75A] hover:bg-[#02b04f] text-white font-bold py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 text-sm transition-colors"
                    >
                      <Map className="w-4 h-4 text-green-100" />
                      <span>네이버 지도 다중 경유지 한 번에 전송</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-600">
                    아직 생성된 일과표가 없습니다.
                  </p>
                  <p className="text-xs text-slate-400">
                    [고객 관리] 탭에서 오늘 방문할 기준 고객사를 선택해 주세요.
                  </p>
                  <button
                    onClick={() => setActiveTab('list')}
                    className="bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl"
                  >
                    고객사 선택하러 가기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 탭 4: 자택/회사 주소 설정 (실시간 검색 지원) */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div>
                  <h2 className="font-bold text-lg flex items-center gap-2 text-slate-900">
                    <Settings className="w-5 h-5 text-blue-600" />
                    <span>직출 / 직퇴 기준지 설정</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    주소를 검색해 등록하면 출발지·복귀지 실제 도로 이동 시간까지 정확히 계산됩니다.
                  </p>
                </div>
              </div>

              {/* 자택 주소 검색 및 입력 카드 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Home className="w-4 h-4 text-blue-600" />
                  <span>자택 주소 (직출 / 직퇴 기준)</span>
                </label>

                <form onSubmit={handleHomeSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={homeSearchQuery}
                    onChange={(e) => setHomeSearchQuery(e.target.value)}
                    placeholder="자택 도로명 또는 아파트명 검색"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingHome}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {isSearchingHome ? '검색중' : '검색'}
                  </button>
                </form>

                {homeSearchResults.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                    {homeSearchResults.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSelectHomeResult(item)}
                        className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex items-start gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {item.name || item.display_name.split(',')[0]}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {item.display_name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    적용된 자택 주소 (직접 수정 가능)
                  </span>
                  <input
                    type="text"
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* 회사 주소 검색 및 입력 카드 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <span>회사 주소 (출근 / 복귀 기준)</span>
                </label>

                <form onSubmit={handleOfficeSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={officeSearchQuery}
                    onChange={(e) => setOfficeSearchQuery(e.target.value)}
                    placeholder="회사 건물명 또는 도로명 검색"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingOffice}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {isSearchingOffice ? '검색중' : '검색'}
                  </button>
                </form>

                {officeSearchResults.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                    {officeSearchResults.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSelectOfficeResult(item)}
                        className="w-full text-left p-2.5 hover:bg-indigo-50 transition-colors flex items-start gap-2"
                      >
                        <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {item.name || item.display_name.split(',')[0]}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {item.display_name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    적용된 회사 주소 (직접 수정 가능)
                  </span>
                  <input
                    type="text"
                    value={officeAddress}
                    onChange={(e) => setOfficeAddress(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <button
                onClick={saveSettings}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors"
              >
                설정 저장하기
              </button>
            </div>
          )}
        </main>

        {/* 하단 네비게이션 */}
        <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 flex justify-around py-2.5 z-20">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'list' ? 'text-blue-700' : 'text-slate-400'
            }`}
          >
            <List className="w-5 h-5" />
            <span>고객 관리</span>
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'add' ? 'text-blue-700' : 'text-slate-400'
            }`}
          >
            <Plus className="w-5 h-5" />
            <span>고객 등록</span>
          </button>
          <button
            onClick={() => setActiveTab('route')}
            className={`flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'route' ? 'text-blue-700' : 'text-slate-400'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span>스케줄러</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'settings' ? 'text-blue-700' : 'text-slate-400'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>설정</span>
          </button>
        </nav>

        {/* PC 내비게이션 안내 모달 */}
        {naviGuideModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center gap-2 text-blue-600 font-bold text-lg">
                <Navigation className="w-5 h-5" />
                <span>{naviGuideModal.appName} 다중 경유지 전송</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5 text-xs text-slate-700">
                {naviGuideModal.visits.map((v, i) => (
                  <div key={v.id} className="font-bold">
                    {i + 1}. {v.name}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                스마트폰에서 실행 시 <strong>{naviGuideModal.appName}</strong>{' '}
                앱이 즉시 열리며 위 경유지 전체가 자동 입력됩니다.
              </p>
              <div className="flex gap-2">
                {naviGuideModal.webUrl && (
                  <a
                    href={naviGuideModal.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-[#03C75A] text-white font-bold py-3 rounded-xl text-xs text-center"
                  >
                    PC 웹 지도로 보기
                  </a>
                )}
                <button
                  onClick={() => setNaviGuideModal(null)}
                  className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl text-xs"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 커스텀 모달 */}
        {confirmDialog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <h3 className="font-bold text-base text-slate-800 mb-4">
                {confirmDialog.msg}
              </h3>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm"
                >
                  취소
                </button>
                <button
                  onClick={confirmDialog.action}
                  className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl text-sm"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 상단 토스트 메시지 */}
        {toastMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-slate-800 text-white px-4 py-2.5 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap">
              <AlertCircle className="w-4 h-4 text-blue-400" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- [좌측 스와이프 점검 완료 카드 컴포넌트 (모바일 세로 스크롤 간섭 방지 적용)] ---
function SwipeableClientCard({
  client,
  onComplete,
  onDelete,
  onGenerateSchedule,
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipeAxisRef = useRef(null); // 'horizontal' | 'vertical' | null

  const handleStart = (clientX, clientY = 0) => {
    startXRef.current = clientX;
    startYRef.current = clientY;
    swipeAxisRef.current = null;
    setIsDragging(true);
  };

  const handleMove = (clientX, clientY = 0) => {
    if (!isDragging) return;
    const diffX = clientX - startXRef.current;
    const diffY = clientY - startYRef.current;

    if (!swipeAxisRef.current) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        swipeAxisRef.current =
          Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical';
      }
    }

    if (swipeAxisRef.current === 'horizontal' && diffX < 0) {
      setTranslateX(Math.max(diffX, -120));
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (swipeAxisRef.current === 'horizontal' && translateX < -85) {
      onComplete();
    }
    swipeAxisRef.current = null;
    setTranslateX(0);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-emerald-500 shadow-sm select-none">
      {/* 스와이프 시 노출되는 완료 영역 */}
      <div className="absolute inset-y-0 right-0 w-24 flex flex-col items-center justify-center text-white font-bold">
        <Check className="w-6 h-6 mb-0.5" />
        <span className="text-[11px]">점검 완료</span>
      </div>

      {/* 카드 전면 */}
      <div
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) =>
          handleStart(e.touches[0].clientX, e.touches[0].clientY)
        }
        onTouchMove={(e) =>
          handleMove(e.touches[0].clientX, e.touches[0].clientY)
        }
        onTouchEnd={handleEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        className="relative bg-white p-4 cursor-grab active:cursor-grabbing"
      >
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-base">
                {client.name}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  client.type === 'MONTHLY'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-teal-100 text-teal-700'
                }`}
              >
                {client.type === 'MONTHLY' ? '월 점검' : '분기 점검'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {client.estimated_time || 60}분
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{client.address}</span>
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-slate-300 hover:text-red-500 p-1 shrink-0"
            title="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {client.knowHow && (
          <div className="mt-2.5 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-1.5 text-[11px] text-amber-900 font-medium">
            💡 {client.knowHow}
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateSchedule();
          }}
          className="mt-3 w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 rounded-xl text-xs flex justify-center items-center gap-1.5 transition-colors border border-blue-200"
        >
          <Play className="w-3.5 h-3.5" />
          <span>이곳을 시작으로 일과표 짜기 (주변 묶기)</span>
        </button>
      </div>
    </div>
  );
}
