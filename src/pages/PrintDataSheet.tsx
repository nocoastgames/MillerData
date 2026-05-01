import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Student, Goal } from '../types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, ExternalLink } from 'lucide-react';

export const PrintDataSheet = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const isIframe = window.self !== window.top;

  useEffect(() => {
    if (!studentId) return;

    const fetchData = async () => {
      try {
        const docRef = doc(db, 'students', studentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setStudent({ id: docSnap.id, ...docSnap.data() } as Student);
        }

        const q = query(
          collection(db, 'goals'),
          where('studentId', '==', studentId),
          where('status', '==', 'active')
        );
        const gSnap = await getDocs(q);
        const gData: Goal[] = [];
        gSnap.forEach(g => gData.push({ id: g.id, ...g.data() } as Goal));
        setGoals(gData);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [studentId]);

  const handlePrintAction = () => {
    if (isIframe) {
      // Must pop out of the iframe to allow window.print
      window.open(window.location.href, '_blank');
    } else {
      window.print();
    }
  };

  // If we just loaded in a new tab to print, we can auto-print optionally.
  // But giving them the button is safer.

  if (!student) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Non-printable header */}
      <div className="flex justify-between items-center mb-8 print:hidden">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </Button>
        <Button onClick={handlePrintAction} className="rounded-full shadow-md">
          {isIframe ? (
            <>
              <ExternalLink className="w-5 h-5 mr-2" /> Open in New Tab to Print
            </>
          ) : (
            <>
              <Printer className="w-5 h-5 mr-2" /> Print PDF
            </>
          )}
        </Button>
      </div>

      {isIframe && (
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl mb-6 text-sm flex items-center print:hidden border border-blue-200">
          <Printer className="w-5 h-5 mr-3 text-blue-500" />
          <p>
            You are currently viewing this inside the preview sandbox. To generate a high-quality PDF, please click the <strong>Open in New Tab to Print</strong> button above. Then use your browser's "Save as PDF" feature.
          </p>
        </div>
      )}

      {/* Printable Area - styling explicitly tailored to fit typical paper via Tailwind print: prefix */}
      <div className="bg-white text-black p-8 shadow-sm border border-gray-200 print:shadow-none print:border-none print:p-0">
        <div className="text-center mb-8 border-b-2 border-black pb-4">
          <h1 className="text-3xl font-bold uppercase tracking-widest mb-1">Data Collection Sheet</h1>
          <h2 className="text-xl">Student: <span className="font-semibold">{student.firstName} {student.lastName}</span></h2>
          <p className="text-sm">Week of / Date Range: _____________________</p>
        </div>

        <div className="space-y-8">
          {goals.map((g, i) => (
            <div key={g.id} className="border border-black p-4 break-inside-avoid">
              <h3 className="font-bold text-lg mb-1 leading-tight">Goal {i + 1}: {g.title}</h3>
              <p className="text-sm italic mb-4">Domain: {g.domain} | Tracking: {g.trackingType}</p>
              
              <table className="w-full border-collapse border border-gray-400 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 p-2 text-left w-1/2">Objective / Sub-Skill</th>
                    <th className="border border-gray-400 p-2 text-center w-[10%]">M</th>
                    <th className="border border-gray-400 p-2 text-center w-[10%]">T</th>
                    <th className="border border-gray-400 p-2 text-center w-[10%]">W</th>
                    <th className="border border-gray-400 p-2 text-center w-[10%]">R</th>
                    <th className="border border-gray-400 p-2 text-center w-[10%]">F</th>
                  </tr>
                </thead>
                <tbody>
                  {(g.objectives || []).map((obj, j) => (
                    <tr key={obj.id}>
                      <td className="border border-gray-400 p-2 font-medium">{j + 1}. {obj.title}</td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                    </tr>
                  ))}
                  {(!g.objectives || g.objectives.length === 0) && (
                    <tr>
                      <td className="border border-gray-400 p-2 font-medium">Whole Goal Data</td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                      <td className="border border-gray-400 p-4"></td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="mt-3">
                <p className="text-xs text-gray-600">Notes:</p>
                <div className="w-full h-8 border-b border-dashed border-gray-400"></div>
                <div className="w-full h-8 border-b border-dashed border-gray-400"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
