'use client';

import React from 'react';
import Link from 'next/link';

export function QuickActions() {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link 
          href="/"
          className="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 transition-colors group"
        >
          <div className="text-center">
            <div className="text-2xl mb-2">🏈</div>
            <h3 className="font-medium text-blue-900 group-hover:text-blue-700">
              Add New League
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Connect ESPN or Sleeper league
            </p>
          </div>
        </Link>

        <Link 
          href="/demo"
          className="bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-4 transition-colors group"
        >
          <div className="text-center">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="font-medium text-green-900 group-hover:text-green-700">
              Quick Draft
            </h3>
            <p className="text-sm text-green-700 mt-1">
              Start drafting immediately
            </p>
          </div>
        </Link>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 opacity-75">
          <div className="text-center">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="font-medium text-purple-900">
              Analytics (Coming Soon)
            </h3>
            <p className="text-sm text-purple-700 mt-1">
              Draft performance insights
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}