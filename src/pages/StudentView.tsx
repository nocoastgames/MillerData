import React from 'react';
import { Navigate, useParams } from 'react-router';

export const StudentView = () => {
  const { studentId } = useParams();
  return <Navigate to={`/student/${studentId}/data`} replace />;
};
