import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Car,
  Plus,
  List,
  Calendar,
  Search,
  AlertCircle,
  Map,
  CheckSquare,
  Loader2,
  ShieldCheck,
  Trash2,
  ExternalLink,
} from 'lucide-react';

// --- [초기 더미 데이터] ---
const INITIAL_CLIENTS = [
  {
    id: 1,
    name: '한컴위드 본사 (테스트)',
    type: 'MONTHLY',
    address: '경기 성남시 분당구 대왕판교로644번길 49',
    knowHow: '지하 3층 C구역 주차 권장. 방문증 수령 시 신분증 필수.',
  },
];

export default function App() {
  // --- [상태 관리] ---
  // LocalStorage를 활용하여 데이터 영구 저장 (새로고침해도 유지됨)
  const [clients, setClients] = useState(() => {
    const saved = localStorage.getItem('fieldops_clients');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_CLIENTS;
      }
    }
    return INITIAL_CLIENTS;
  });

  const [activeTab, setActiveTab] = useState('LIST'); // LIST, ADD, ROUTE
  const [selectedIds, setSelectedIds] = useState([]);

  // 목록 탭 상태
  const [filter, setFilter] = useState('ALL'); // ALL, MONTHLY, QUARTERLY

  // 동선 최적화 탭 상태
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [routeOrder, setRouteOrder] = useState([]);

  // 데이터 변경 시 LocalStorage 업데이트
  useEffect(() => {
    localStorage.setItem('fieldops_clients', JSON.stringify(clients));
  }, [clients]);

  // --- [뷰 렌더링 함수들] ---
  const renderListTab = () => (
    <ListTab
      clients={clients}
      setClients={setClients}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      filter={filter}
      setFilter={setFilter}
    />
  );

  const renderAddTab = () => (
    <AddClientTab
      clients={clients}
      setClients={setClients}
      setActiveTab={setActiveTab}
    />
  );

  const renderRouteTab = () => (
    <RouteTab
      clients={clients}
      selectedIds={selectedIds}
      isOptimizing={isOptimizing}
      setIsOptimizing={setIsOptimizing}
      routeOrder={routeOrder}
      setRouteOrder={setRouteOrder}
    />
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans max-w-md mx-auto shadow-2xl relative flex flex-col pb-16">
      {/* 글로벌 헤더 */}
      <header className="bg-blue-700 text-white p-4 shadow-md sticky top-0 z-20 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-200" />
          FieldOps Optimizer
        </h1>
        <div className="text-xs bg-blue-800 px-2 py-1 rounded-full text-blue-200 border border-blue-600">
          대리 진급 PT
        </div>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'LIST' && renderListTab()}
        {activeTab === 'ADD' && renderAddTab()}
        {activeTab === 'ROUTE' && renderRouteTab()}
      </main>

      {/* 하단 네비게이션 바 */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-safe shadow-[0_-5px_10px_rgba(0,0,0,0.05)] z-30">
        <NavItem
          icon={<List className="w-6 h-6" />}
          label="고객 관리"
          isActive={activeTab === 'LIST'}
          onClick={() => setActiveTab('LIST')}
        />
        <NavItem
          icon={<Plus className="w-6 h-6" />}
          label="고객 등록"
          isActive={activeTab === 'ADD'}
          onClick={() => setActiveTab('ADD')}
        />
        <NavItem
          icon={<Navigation className="w-6 h-6" />}
          label="오늘 동선"
          isActive={activeTab === 'ROUTE'}
          onClick={() => setActiveTab('ROUTE')}
          badgeCount={selectedIds.length}
        />
      </nav>
    </div>
  );
}

// ==========================================
// 서브 컴포넌트: 하단 네비게이션 아이템
// ==========================================
function NavItem({ icon, label, isActive, onClick, badgeCount }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-1/3 py-2 relative transition-colors ${
        isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <div className="relative">
        {icon}
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white">
            {badgeCount}
          </span>
        )}
      </div>
      <span
        className={`text-[11px] mt-1 font-medium ${
          isActive ? 'font-bold' : ''
        }`}
      >
        {label}
      </span>
    </button>
  );
}

// ==========================================
// 탭 1: 고객사 목록 (ListTab)
// ==========================================
function ListTab({
  clients,
  setClients,
  selectedIds,
  setSelectedIds,
  filter,
  setFilter,
}) {
  const filteredClients = clients.filter(
    (c) => filter === 'ALL' || c.type === filter
  );

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const deleteClient = (id, e) => {
    e.stopPropagation();
    if (window.confirm('정말 삭제하시겠습니까?')) {
      setClients(clients.filter((c) => c.id !== id));
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  return (
    <div className="animate-in fade-in duration-200">
      {/* 필터 */}
      <div className="flex p-3 gap-2 bg-white border-b sticky top-0 z-10">
        {[
          { id: 'ALL', label: '전체' },
          { id: 'MONTHLY', label: '월 점검' },
          { id: 'QUARTERLY', label: '분기 점검' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${
              filter === tab.id
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {filteredClients.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>등록된 고객사가 없습니다.</p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={client.id}
              onClick={() => toggleSelect(client.id)}
              className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${
                selectedIds.includes(client.id)
                  ? 'border-blue-500 shadow-md bg-blue-50/30'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                      selectedIds.includes(client.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-slate-300'
                    }`}
                  >
                    {selectedIds.includes(client.id) && (
                      <CheckSquare className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-1.5 ${
                        client.type === 'MONTHLY'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {client.type === 'MONTHLY' ? '월 점검' : '분기 점검'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteClient(client.id, e)}
                  className="text-slate-300 hover:text-red-500 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-bold text-lg text-slate-800 ml-7">
                {client.name}
              </h3>
              <p className="text-xs text-slate-500 flex items-start gap-1 mt-1 ml-7">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{client.address}</span>
              </p>

              {/* 목록에서 주차/출입 노하우 경고 강조 표시 */}
              {client.knowHow && (
                <div className="ml-7 mt-2 bg-orange-50 p-2 rounded-md border border-orange-100 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-orange-800 font-medium leading-tight line-clamp-2">
                    {client.knowHow}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==========================================
// 탭 2: 고객사 등록 (AddClientTab)
// ==========================================
function AddClientTab({ clients, setClients, setActiveTab }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'MONTHLY',
    address: '',
    knowHow: '',
  });

  // TMAP 스타일 장소 검색용 상태
  const [poiKeyword, setPoiKeyword] = useState('');
  const [poiResults, setPoiResults] = useState([]);
  const [isSearchingPoi, setIsSearchingPoi] = useState(false);

  const handlePoiSearch = async () => {
    if (!poiKeyword.trim()) {
      alert('검색할 장소나 건물명을 입력해주세요. (예: 국민은행, 한국전력)');
      return;
    }
    setIsSearchingPoi(true);

    try {
      // 💡 [실제 구동 API 연동] OpenStreetMap Nominatim API 적용 (무료/API Key 불필요)
      // TMAP이나 네이버지도 API 적용 전, 실제 데이터로 완벽하게 데모가 가능하도록 구현했습니다.
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          poiKeyword
        )}&format=json&addressdetails=1&countrycodes=kr&limit=10`
      );
      const data = await response.json();

      if (data.length === 0) {
        alert(
          '검색 결과가 없습니다. 도로명이나 더 정확한 건물명으로 검색해보세요.'
        );
      }

      const realPois = data.map((p) => ({
        id: p.place_id,
        // API 결과에 name이 없으면 주소의 첫 번째 항목을 이름으로 대체
        name:
          p.name ||
          (p.display_name ? p.display_name.split(',')[0] : '이름 없음'),
        address: p.display_name,
      }));

      setPoiResults(realPois);
    } catch (error) {
      console.error('API 연동 에러:', error);
      alert('네트워크 또는 검색 서버 오류가 발생했습니다.');
    } finally {
      setIsSearchingPoi(false);
    }
  };

  const handleSelectPoi = (poi) => {
    // 장소 선택 시 고객사명과 주소를 자동 세팅
    setFormData((prev) => ({
      ...prev,
      name: poi.name,
      address: poi.address,
    }));
    setPoiResults([]); // 목록 닫기
    setPoiKeyword(''); // 검색창 초기화
  };

  const handleSave = () => {
    if (!formData.name.trim() || !formData.address.trim()) {
      alert('고객사명과 주소는 필수입니다. 상단 장소 검색을 이용해보세요.');
      return;
    }

    const newClient = {
      ...formData,
      id: Date.now(), // 고유 ID 생성
    };

    setClients([...clients, newClient]);
    setActiveTab('LIST'); // 저장 후 리스트로 이동
  };

  return (
    <div className="p-5 animate-in fade-in duration-200">
      <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
        <Plus className="w-5 h-5 text-blue-600" /> 신규 현장 등록
      </h2>

      <div className="space-y-4">
        {/* TMAP 스타일 장소/건물명 검색 UI */}
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 mb-6 shadow-sm">
          <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
            <MapPin className="w-4 h-4 text-blue-500" /> 장소/건물명 검색
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={poiKeyword}
              onChange={(e) => setPoiKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePoiSearch()}
              placeholder="예: 우리은행, 국민연금공단"
              className="flex-1 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={handlePoiSearch}
              className="bg-slate-800 text-white px-4 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-slate-700 transition-colors"
            >
              {isSearchingPoi ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}{' '}
              검색
            </button>
          </div>

          {/* 검색 결과 목록 */}
          {poiResults.length > 0 && (
            <div className="mt-3 bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm animate-in fade-in zoom-in-95">
              {poiResults.map((poi) => (
                <div
                  key={poi.id}
                  onClick={() => handleSelectPoi(poi)}
                  className="p-3 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors last:border-b-0 flex items-start gap-2"
                >
                  <MapPin className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      {poi.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {poi.address}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 경계선 */}
        <div className="border-t border-slate-200 pt-2"></div>

        {/* 고객사명 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            고객사명 *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="상단에서 검색하면 자동 입력됩니다"
            className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* 점검 주기 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            점검 주기 *
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setFormData({ ...formData, type: 'MONTHLY' })}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                formData.type === 'MONTHLY'
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              월 점검
            </button>
            <button
              onClick={() => setFormData({ ...formData, type: 'QUARTERLY' })}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                formData.type === 'QUARTERLY'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              분기 점검
            </button>
          </div>
        </div>

        {/* 주소 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            주소 *
          </label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) =>
              setFormData({ ...formData, address: e.target.value })
            }
            placeholder="상단에서 검색하면 자동 입력됩니다"
            className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* 주차 및 출입 노하우 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            현장 출입/주차 노하우 (선택)
          </label>
          <textarea
            value={formData.knowHow}
            onChange={(e) =>
              setFormData({ ...formData, knowHow: e.target.value })
            }
            placeholder="예: 후문 주차장 이용, 전산실 3층..."
            rows={3}
            className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          ></textarea>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md mt-6 hover:bg-blue-700 transition-colors"
        >
          현장 데이터 저장하기
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 탭 3: 동선 최적화 (RouteTab)
// ==========================================
function RouteTab({
  clients,
  selectedIds,
  isOptimizing,
  setIsOptimizing,
  routeOrder,
  setRouteOrder,
}) {
  const selectedClients = clients.filter((c) => selectedIds.includes(c.id));

  // 시연용 커스텀 모달 상태 관리 (alert 대체)
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [demoMessage, setDemoMessage] = useState('');

  const handleOptimize = () => {
    if (selectedClients.length === 0) return;

    setIsOptimizing(true);
    setRouteOrder([]);

    // 시뮬레이션: 1.5초 후 현재 선택된 리스트를 재정렬 (임의 셔플 시뮬레이션)
    setTimeout(() => {
      const optimized = [...selectedClients].sort(() => Math.random() - 0.5); // 데모용 임의 정렬
      setRouteOrder(optimized);
      setIsOptimizing(false);
    }, 1500);
  };

  const openMap = (type, client) => {
    // 💡 핵심 수정: OSM의 긴 글로벌 주소(우편번호, 대한민국 포함)로 인해 검색이 실패하는 것을 방지.
    // 쉼표(,)를 기준으로 가장 앞부분에 있는 '장소명' 또는 '핵심 주소'만 추출하여 목적지로 전달합니다.
    const rawSearchText = client.name || client.address;
    const cleanQuery = rawSearchText.split(',')[0].trim();

    if (type === 'NAVER_NAVI') {
      // 네이버 모바일 웹 '자동차 길찾기' 목적지로 바로 연동 (앱이 있으면 앱으로, 없으면 웹으로 폴백)
      window.open(
        `https://m.map.naver.com/route.nhn?menu=car&ename=${encodeURIComponent(
          cleanQuery
        )}`,
        '_blank'
      );
    } else if (type === 'TMAP') {
      // TMAP URL Scheme: TMAP 앱을 직접 실행하며 목적지로 길안내 즉시 시작
      window.location.href = `tmap://route?goalname=${encodeURIComponent(
        cleanQuery
      )}`;
    }
  };

  const handleMultiWaypointNavi = () => {
    // 시연용: 현재 최적화된 경로들의 이름을 'A -> B -> C' 형태로 추출
    const routeNames = routeOrder
      .map((c) => (c.name || c.address).split(',')[0].trim())
      .join(' ➔ ');
    setDemoMessage(
      `실제 TMAP API와 연동하여\n\n[ ${routeNames} ]\n\n전체 경유지가 포함된 최적화 경로를 TMAP 앱으로 한 번에 전송합니다.`
    );
    setShowDemoModal(true);
  };

  if (selectedClients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in">
        <Map className="w-16 h-16 text-slate-200 mb-4" />
        <h3 className="font-bold text-lg text-slate-600">
          선택된 현장이 없습니다.
        </h3>
        <p className="text-sm text-slate-400 mt-2">
          고객 관리 탭에서 오늘 방문할 곳을 체크해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 relative animate-in fade-in">
      {!routeOrder.length && !isOptimizing && (
        <>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
            <h3 className="font-bold text-blue-800 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4" /> 오늘 방문 예정지 (
              {selectedClients.length}곳)
            </h3>
            <p className="text-xs text-blue-600">
              아래 버튼을 눌러 Tmap AI 경로 최적화를 실행하세요.
            </p>
          </div>

          <button
            onClick={handleOptimize}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2"
          >
            <Navigation className="w-5 h-5" /> AI 최단거리 스케줄링 시작
          </button>
        </>
      )}

      {/* 로딩 연출 */}
      {isOptimizing && (
        <div className="flex flex-col items-center justify-center py-20 text-blue-600 space-y-4">
          <Loader2 className="w-12 h-12 animate-spin" />
          <p className="font-bold text-lg">최적 경로 계산 중...</p>
          <p className="text-sm text-slate-500">
            교통 상황을 분석하고 있습니다.
          </p>
        </div>
      )}

      {/* 최적화 결과 표시 */}
      {routeOrder.length > 0 && !isOptimizing && (
        <div className="space-y-0 relative mt-4">
          <div className="flex justify-between items-end mb-6 border-b pb-2">
            <h2 className="text-xl font-bold text-slate-800">
              최적화 동선 안내
            </h2>
            <button
              onClick={() => setRouteOrder([])}
              className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded"
            >
              다시 계산
            </button>
          </div>

          {/* 연결 선 */}
          <div className="absolute left-[23px] top-[60px] bottom-10 w-0.5 bg-blue-200 z-0"></div>

          {routeOrder.map((client, idx) => (
            <div
              key={client.id}
              className="relative flex gap-4 pb-8 z-10 animate-in slide-in-from-right-4 duration-300"
              style={{
                animationDelay: `${idx * 150}ms`,
                animationFillMode: 'both',
              }}
            >
              {/* 순번 노드 */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-white border-4 border-blue-500 rounded-full flex items-center justify-center font-bold text-blue-700 shadow-md">
                  {idx + 1}
                </div>
              </div>

              {/* 상세 카드 */}
              <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-1">{client.name}</h3>
                <p className="text-xs text-slate-500 mb-3">{client.address}</p>

                {client.knowHow && (
                  <div className="bg-orange-50/80 p-2.5 rounded-lg mb-4 border border-orange-100">
                    <p className="text-[11px] text-orange-800 flex items-start gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-orange-500 flex-shrink-0" />
                      {client.knowHow}
                    </p>
                  </div>
                )}

                {/* 실제 상용 내비게이션 다이렉트 연동 버튼 */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => openMap('TMAP', client)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#00498c] text-white text-xs font-bold py-3 rounded-lg hover:bg-[#00386b] shadow-sm transition-colors"
                  >
                    🚀 TMAP 내비
                  </button>
                  <button
                    onClick={() => openMap('NAVER_NAVI', client)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#03C75A] text-white text-xs font-bold py-3 rounded-lg hover:bg-[#02b350] shadow-sm transition-colors"
                  >
                    🚙 네이버 내비
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* TMAP 다중 경유지 전체 안내 버튼 (시연용 필살기) */}
          <div className="mt-8 mb-4 px-2">
            <button
              onClick={handleMultiWaypointNavi}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:from-teal-700 hover:to-emerald-700 transition-all transform hover:scale-[1.02]"
            >
              <span className="text-xl">🗺️</span> TMAP 다중 경유지 전체 안내
              시작
            </button>
          </div>
        </div>
      )}

      {/* PT 시연용 알림창 (Modal) */}
      {showDemoModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in-95">
            <div className="flex items-center gap-2 mb-4 text-blue-600">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="font-bold text-lg">PT 시연용 알림</h3>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mb-6 font-medium">
              {demoMessage}
            </p>
            <button
              onClick={() => setShowDemoModal(false)}
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              확인 (전송 완료)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
