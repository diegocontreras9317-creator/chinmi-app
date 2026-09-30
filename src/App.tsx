import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Navbar } from './components/layout/Navbar';
import { TablesModule } from './components/tables/TablesModule';
import { InventoryModule } from './components/inventory/InventoryModule';
import { PerishablesModule } from './components/perishables/PerishablesModule';
import { SubscriptionModal } from './components/pricing/SubscriptionModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { SalesHistoryModal } from './components/sales/SalesHistoryModal';
import { ManagerPinModal } from './components/auth/ManagerPinModal';
import { CustomerMenuPortal } from './components/customer/CustomerMenuPortal';
import { WaiterCallToast } from './components/common/WaiterCallToast';

const MainLayout: React.FC = () => {
  const { isGerente } = useAuth();
  const { theme, customerViewTableId, setCustomerViewTableId } = useApp();

  const [activeTab, setActiveTab] = useState<'tables' | 'inventory' | 'perishables' | 'sales'>('tables');
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);

  // Check if current URL is public customer menu route (/menu or contains restId/uid query)
  const isPublicMenuRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/menu') ||
    new URLSearchParams(window.location.search).has('restId') ||
    new URLSearchParams(window.location.search).has('uid') ||
    customerViewTableId !== null
  );

  // Enforce: Cajero and Camarero ONLY have access to tables and orders
  React.useEffect(() => {
    if (!isGerente && activeTab !== 'tables') {
      setActiveTab('tables');
    }
  }, [isGerente, activeTab]);

  // If viewing customer digital menu / QR order portal, display it directly (NO staff login required)
  if (isPublicMenuRoute) {
    return (
      <CustomerMenuPortal
        tableId={customerViewTableId || ''}
        onExit={() => setCustomerViewTableId(null)}
      />
    );
  }

  return (
    <ProtectedRoute>
      <div className={`min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors ${theme === 'dark' ? 'dark' : ''}`}>
        
        {/* Top Navbar */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === 'sales') {
              if (isGerente) setIsSalesModalOpen(true);
            } else if (tab === 'inventory') {
              if (isGerente) setActiveTab('inventory');
            } else if (tab === 'perishables') {
              if (isGerente) setActiveTab('perishables');
            } else {
              setActiveTab('tables');
            }
          }}
          onOpenSubscription={() => {
            if (isGerente) setIsSubscriptionOpen(true);
          }}
          onOpenSettings={() => {
            if (isGerente) setIsSettingsOpen(true);
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 pb-12">
          {activeTab === 'tables' && (
            <TablesModule
              onOpenSubscription={() => {
                if (isGerente) setIsSubscriptionOpen(true);
              }}
            />
          )}

          {isGerente && activeTab === 'inventory' && (
            <InventoryModule
              onOpenSubscription={() => setIsSubscriptionOpen(true)}
            />
          )}

          {isGerente && activeTab === 'perishables' && (
            <PerishablesModule
              onOpenSubscription={() => setIsSubscriptionOpen(true)}
            />
          )}
        </main>

        {/* Freemium Subscription Modal (Gerente only) */}
        {isGerente && (
          <SubscriptionModal
            isOpen={isSubscriptionOpen}
            onClose={() => setIsSubscriptionOpen(false)}
          />
        )}

        {/* Business Settings & Team Permissions Modal (Gerente only) */}
        {isGerente && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {/* Sales History Modal (Gerente only) */}
        {isGerente && (
          <SalesHistoryModal
            isOpen={isSalesModalOpen}
            onClose={() => setIsSalesModalOpen(false)}
          />
        )}

        {/* Global Manager PIN Verification Modal */}
        <ManagerPinModal />

        {/* Floating Waiter Call & Bill Request Alerts for Staff */}
        <WaiterCallToast onNavigateToTable={() => setActiveTab('tables')} />

      </div>
    </ProtectedRoute>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </AuthProvider>
  );
}
