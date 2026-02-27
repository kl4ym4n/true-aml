'use client';

import { useState } from 'react';
import Tabs from '@/components/Tabs/Tabs';
import AddressCheckPanel from '@/components/AddressCheckPanel/AddressCheckPanel';
import TransactionCheckPanel from '@/components/TransactionCheckPanel/TransactionCheckPanel';
import styles from './page.module.css';

export default function Home() {
  const [activeTab, setActiveTab] = useState('address');

  return (
    <div className={styles.dashboard}>
      <div className={styles.card}>
        <Tabs
          tabs={[
            { id: 'address', label: 'Address Check' },
            { id: 'transaction', label: 'Transaction Check' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {activeTab === 'address' && (
            <div className={styles.tabPanel}>
              <AddressCheckPanel />
            </div>
          )}
          {activeTab === 'transaction' && (
            <div className={styles.tabPanel}>
              <TransactionCheckPanel />
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}
