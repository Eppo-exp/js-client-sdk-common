import { logger } from './application-logger';
import { IAssignmentHooks } from './assignment-hooks';
import { IAssignmentLogger, IAssignmentEvent } from './assignment-logger';
import {
  AbstractAssignmentCache,
  AssignmentCache,
  NonExpiringInMemoryAssignmentCache,
  LRUInMemoryAssignmentCache,
  AsyncMap,
} from './cache/abstract-assignment-cache';
import EppoClient, { FlagConfigurationRequestParameters, IEppoClient } from './client/eppo-client';
import {
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
} from './configuration-store/configuration-store';
import { HybridConfigurationStore } from './configuration-store/hybrid.store';
import { MemoryStore, MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import * as constants from './constants';
import FlagConfigRequestor from './flag-configuration-requestor';
import HttpClient from './http-client';
import { Flag, VariationType } from './interfaces';
import { AttributeType, SubjectAttributes } from './types';
import * as validation from './validation';

export {
  logger as applicationLogger,
  AbstractAssignmentCache,
  IAssignmentHooks,
  IAssignmentLogger,
  IAssignmentEvent,
  EppoClient,
  IEppoClient,
  constants,
  FlagConfigRequestor,
  HttpClient,
  validation,

  // Configuration store
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
  MemoryStore,
  HybridConfigurationStore,
  MemoryOnlyConfigurationStore,

  // Assignment cache
  AssignmentCache,
  AsyncMap,
  NonExpiringInMemoryAssignmentCache,
  LRUInMemoryAssignmentCache,

  // Interfaces
  FlagConfigurationRequestParameters,
  Flag,
  VariationType,
  AttributeType,
  SubjectAttributes,
};
