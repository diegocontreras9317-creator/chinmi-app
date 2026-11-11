import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { PrivateNavbar } from './components/layout/PrivateNavbar';
import { TablesModule } from './components/tables/TablesModule';
import { InventoryModule } from './components/inventory/InventoryModule';
import { PerishablesModule } from './components/perishables/PerishablesModule';
import { SubscriptionModal } from './components/pricing/SubscriptionModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { SalesHistoryModal } from './components/sales/SalesHistoryModal';
import { ManagerPinModal } from './components/auth/ManagerPinModal';
import { CustomerMenuPortal } from './components/customer/CustomerMenuPortal';
import { WaiterCallToast } from './components/common/WaiterCallToast';
import { NewOrderToast } from './components/common/NewOrderToast';
import { ProfileSelectionScreen } from './components/auth/ProfileSelectionScreen';
import { EmployeeManagementModal } from './components/settings/EmployeeManagementModal';
import { FloatingProWhatsappSupport } from './components/common/FloatingProWhatsappSupport';
import { EpaycoReturnHandler } from './components/pricing/EpaycoReturnHandler';
import { UnverifiedEmailBanner } from './components/common/UnverifiedEmailBanner';
import { BillingModule } from './components/billing/BillingModule';

const MainLayout: React.FC = () => {
  const { isGerente, isContabilidad, empleadoActivo } = useAuth();
  const { theme, customerViewTableId, setCustomerViewTableId } = useApp();

  const [activeTab, setActiveTab] = useState<'tables' | 'inventory' | 'perishables' | 'sales' | 'billing'>(() => {
    if (empleadoActivo?.rol === 'Contabilidad') return 'sales';
    return 'tables';
  });
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  // Check if current URL is public customer menu route (/menu or contains restId/uid query)
  const isPublicMenuRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/menu') ||
    new URLSearchParams(window.location.search).has('restId') ||
    new URLSearchParams(window.location.search).has('uid') ||
    customerViewTableId !== null
  );

  // Enforce role-based access
  React.useEffect(() => {
    if (isContabilidad && activeTab !== 'sales' && activeTab !== 'billing') {
      setActiveTab('sales');
    } else if (!isGerente && !isContabilidad && activeTab !== 'tables') {
      setActiveTab('tables');
    }
  }, [isGerente, isContabilidad, activeTab]);

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
      <EpaycoReturnHandler />
      {/* Si la cuenta de Firebase está logueada pero NO se ha seleccionado perfil de empleado activo: */}
      {!empleadoActivo ? (
        <ProfileSelectionScreen
          onOpenEmployeeManagement={() => setIsEmployeeModalOpen(true)}
        />
      ) : (
        <div className={`min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors ${theme === 'dark' ? 'dark' : ''}`}>
          
          {/* Banner de Verificación de Correo Electrónico */}
          <UnverifiedEmailBanner />

          {/* Top Navbar (PrivateNavbar para rutas privadas con branding dinámico de restaurante) */}
          <PrivateNavbar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              if (tab === 'sales') {
                if (isGerente) setIsSalesModalOpen(true);
                else if (isContabilidad) setActiveTab('sales');
              } else if (tab === 'billing') {
                if (isGerente || isContabilidad) setActiveTab('billing');
              } else if (tab === 'inventory') {
                if (isGerente) setActiveTab('inventory');
              } else if (tab === 'perishables') {
                if (isGerente) setActiveTab('perishables');
              } else {
                if (isGerente || (!isGerente && !isContabilidad)) setActiveTab('tables');
              }
            }}
            onOpenSubscription={() => {
              if (isGerente) setIsSubscriptionOpen(true);
            }}
            onOpenSettings={() => {
              if (isGerente) setIsSettingsOpen(true);
            }}
            onOpenEmployees={() => {
              if (isGerente) setIsEmployeeModalOpen(true);
            }}
          />

          {/* Main Content Area */}
          <main className="flex-1 pb-12">
            {!isContabilidad && activeTab === 'tables' && (
              <TablesModule
                onOpenSubscription={() => {
                  if (isGerente) setIsSubscriptionOpen(true);
                }}
              />
            )}

            {isContabilidad && activeTab === 'sales' && (
              <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
                <SalesHistoryModal
                  isOpen={true}
                  onClose={() => {}}
                  embedded={true}
                />
              </div>
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

            {(isGerente || isContabilidad) && activeTab === 'billing' && (
              <BillingModule
                onBackToTables={() => setActiveTab(isContabilidad ? 'sales' : 'tables')}
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

          {/* Employee & Role Configuration Modal (Admin only) */}
          {isGerente && (
            <EmployeeManagementModal
              isOpen={isEmployeeModalOpen}
              onClose={() => setIsEmployeeModalOpen(false)}
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

          {/* Floating Real-Time New Order Alerts for Staff */}
          <NewOrderToast onNavigateToTable={() => setActiveTab('tables')} />

        </div>
      )}

      {/* Botón flotante de soporte WhatsApp exclusivo para suscripciones pagas activas */}
      <div className={theme === 'dark' ? 'dark' : ''}>
        <FloatingProWhatsappSupport />
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
